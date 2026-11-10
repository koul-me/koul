# Operations

How the hosted parts of Koul are run on testnet: keeper health, the status page, the lease guard, rate limits,
traction, the competition backend and the waitlist. For how Koul itself works, see [`architecture.md`](architecture.md).

## Keeper health

After every pass the keeper writes a heartbeat to Redis (`koul:keeper:heartbeat`: when, wallets, autopilots,
submitted, failed). `GET /api/keeper/status` returns it with `healthy` and plain `problems`.

When the heartbeat is older than five minutes (or four intervals plus a pass), or the lease guard reports a lease that
needs a person, the route emails `WAITLIST_NOTIFY_TO` and every address in `KEEPER_ALERT_TO` (comma separated), at
most once an hour. `.github/workflows/keeper-watch.yml` calls it every 10 minutes, so the alarm works with nobody on
the site.

## Status page

`koul.me/status` is public: one headline, the keeper's last check, pass time, autopilots watched, trades in the last
hour, and a day of pass time and trades (the keeper keeps one point per pass in `koul:keeper:history`).

`/status/private` adds problems, the last pass's failure reasons, every lease, and the keeper and channel balances. It
opens only in a browser that has visited `/api/status/unlock?key=<STATUS_SECRET>`.

## Lease guard

`cd keeper && pnpm leases [--dry]` reads the instance and wasm lease of every contract Koul touches (router, policy,
oracles, verifiers, XOXNO, the aggregator, every token). Anything under 30 days is restored or extended to 90, paid by
the keeper account and never above 40 XLM an entry. It runs daily in `.github/workflows/leases.yml` and leaves its
report in Redis (`koul:leases`) for the keeper status.

## Rate limits

The chat, parser, test USDC, Circle faucet, waitlist, funds and competition routes are limited per IP (and per wallet
for the money routes) with Upstash Ratelimit, in `web/lib/rate-limit.ts`. A limiter outage lets requests through.

## Traction

`koul.me/status/traction` sits behind the same `STATUS_SECRET` cookie as `/status/private`. It shows users with an
autopilot, live autopilots, rules, trades (24 h, 7 days, total), swap volume, trades per autopilot and wallets
created, with the team's wallets apart, daily charts, a created → autopilot → traded funnel and the top wallets.

`cd keeper && pnpm traction [--dry]` collects it:

- It reads the router's events from a stored cursor. The first run starts at the oldest ledger the RPC keeps (about
  seven days), so after that Redis holds the only history.
- It folds the events into per-day and per-wallet numbers (`packages/core/src/traction.ts`, tested) and counts live
  autopilots and rules from the router's views.
- Swap volume is each swap's input at the Reflector price when collected. Beside it, "paid out by pools" is the output
  at the same prices, which testnet pools inflate several times.
- `--rebuild` (also a workflow input) counts every event the RPC still keeps from scratch, and refuses when that would
  drop recorded history.
- Everything, cursor included, is one string in `koul:traction:state` written with one SET, so a re-run never counts
  an event twice. Live counts go on `koul:traction:snapshots`.
- It runs hourly from `.github/workflows/traction.yml`, at 5 Redis commands a run.

Team wallets are in `koul:traction:team`; `SADD koul:traction:team <wallet>` tags another, retroactively. The 57 wallets of the 28 October 2026 load test are recognised from their events. The
test USDC route adds each wallet to `koul:traction:created` on its first grant, so "created" counts only from that
deploy on.

## Competition backend

Scoring rules and every shape live in `packages/core/src/competition.ts` (`@koul/core`).

- **Value** is idle USDC, plus USDC supplied minus borrowed on XOXNO, plus every swap token (XLM included) at the
  Reflector price. `excludeTokens` can leave tokens out.
- **Outside money** (a classic account, another smart wallet, a mint) is netted out: `pnl = value - net inflows`,
  `return = pnl / net inflows`. Value already in a wallet that no flow in the network's event window explains becomes
  opening capital, so it can never count as profit.
- **Flags** (unranked): outside money above the `startingBasket` (token units valued at the entry's opening prices,
  1% plus $1 slack; `startingCapitalUsd` without a basket), a rule on the testnet mock price feed, or, with
  `autopilotOnly`, a move the autopilot didn't make (the 1 USDC that opens the XOXNO account is allowed).
- **Indexer:** `cd keeper && pnpm competition [--loop --every 300]`. Settings: `pnpm competition config <file.json>`
  (a `CompetitionConfig`). A manual entrant: `pnpm competition add <wallet> <handle>`. In production it runs from
  `.github/workflows/competition.yml` and stops at once while no competition is configured.

Routes for the frontend (types in `@koul/core`):

| Route | Returns |
|---|---|
| `GET /api/competition` | `CompetitionInfo`: settings, verified entrants, last update |
| `GET /api/competition/leaderboard?offset=0&limit=50` | `Leaderboard`: ranked rows (`LeaderboardRow`), total |
| `GET /api/competition/entrant/:handle` | `EntrantView`: score, rank, value history hourly |
| `POST /api/competition/challenge` `{ wallet }` | A one-time challenge and the wallet's passkey credential ids |
| `POST /api/competition/register` `{ wallet, handle, email, assertion }` | The passkey signature confirms the entry, and it is scored from then on; a "You're in" note is mailed best effort |
| `GET /api/competition/verify?token=` | Confirmation links mailed before entries were confirmed by passkey; still honoured |

Entering takes one call from the app: `enterCompetition({ wallet, handle, email })` in
`web/lib/competition-client.ts` asks for the challenge, has the wallet's passkey sign it (one prompt) and registers.
The server checks the signature against the passkey public key the wallet stores on-chain, so nobody can enter a
wallet they don't control. One entry per wallet, handle and email.

## Waitlist and invites

`NEXT_PUBLIC_KOUL_WAITLIST=open` collects emails on the landing page and leaves the app open to anyone.
`NEXT_PUBLIC_KOUL_WAITLIST=closed` (or `1`) also closes the app: every app page shows the waitlist instead
(`web/proxy.ts`, rules in `web/lib/app-host.ts`), and the landing's Open app becomes an email field. The flag is read
at build time, so changing it needs a redeploy.

- **Shared codes.** `KOUL_INVITE_CODES` (comma separated) are the way in: `app.koul.me/?invite=<code>` sets a 90-day
  cookie and drops the parameter. Taking a code out of the list revokes it. `cd web && pnpm invite-codes 5 <label>`
  makes five new codes with their links and the value to append on Vercel (Production); then redeploy.
- **Signups** go to Upstash Redis through `POST /api/waitlist` (`KV_REST_API_URL` and `KV_REST_API_TOKEN`, or the
  `UPSTASH_REDIS_REST_*` names) as the sorted set `koul:waitlist`, scored by join time, with the source in the hash
  `koul:waitlist:from`. Read the list in the Upstash console's Data Browser.
- **Emails.** A new signup sends two emails through Resend (`RESEND_API_KEY`, sending domain koul.me): a confirmation
  to the person and a notice to `WAITLIST_NOTIFY_TO`. A repeat signup sends nothing.
- **Personal codes.** The notice carries an Approve link (`/api/waitlist/approve`, signed per email with
  `WAITLIST_SECRET`). Its confirm button makes a personal code (`inv-xxxxxxxx`, kept in Redis as `koul:invite:<code>`
  and `koul:waitlist:approved`) and emails the person an invite link. The first use sets a signed cookie, so the proxy
  reads Redis only when `?invite=` is in the address. Deleting `koul:invite:<code>` stops new browsers; browsers
  already in keep access until the cookie expires or `WAITLIST_SECRET` changes.
- "Have a code?" under the waitlist field, on the landing and the waitlist page, takes either kind of code.
