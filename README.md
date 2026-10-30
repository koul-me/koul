# Koul

## ▶ Try it live: https://koul.me

**Say what should happen to your money and when. Koul turns it into rules that live on Stellar and execute
themselves.** Stellar **testnet**, no login, no seed phrase.

| | |
|---|---|
| **Live app** | **https://koul.me** (the app itself is at https://app.koul.me) |
| Oracle admin, the demo lever for USD/TRY | https://koul-oracle.vercel.app/oracle |
| Repo | https://github.com/koul-me/koul |
| Pitch deck | _add link_ |
| Judge walkthrough | [How to evaluate](#how-to-evaluate), eight steps on the live app |
| Paste-ready summary | [`docs/submission-summary.md`](docs/submission-summary.md) |

---

## Overview

**What we are building.** Koul is a conditional execution engine on Stellar. A user writes a sentence, Koul turns it
into an ordered list of rules, and those rules are stored in a contract. A keeper pokes that contract on a schedule;
the contract itself re-reads the world, decides whether a rule is true, and executes the action in the same
transaction. The user's funds never leave their own smart account, and the key that pokes the contract is confined
by a policy contract that rejects anything the rules do not need.

**The problem.** Someone in Turkey holding lira watches it lose value, moves savings into dollars, and then has to
watch a screen: which pool pays more today, is my loan close to liquidation, has the exchange rate crossed the line
where I want out. Doing that by hand means being awake at the right moment. Handing it to a bot means handing over
the keys. Every "automation" in DeFi today is one of those two: a person watching charts, or custody given away.

**Who it is for.** People in high-inflation economies who save in dollars and want a floor under their downside,
and any on-chain user who wants a strategy to run without surrendering custody. For the hackathon the first user is
concrete: a lira saver who wants yield on XOXNO and an automatic exit if the lira breaks a level.

**Why it is worth solving.** Conditional execution is the missing primitive between a wallet and a strategy. Limit
orders exist on exchanges because nobody can watch a price all day. On-chain there is no neutral, custody-free way
to say "if this, then that" across protocols. Without it, the honest options are to watch manually or to trust a
custodian.

**Value proposition.** Koul is protocol-agnostic by design: the rule engine knows conditions and actions, not a
particular protocol. Three properties make it different from a bot:

1. **The rules are on-chain and readable.** They are contract state, not a config on someone's server. Anyone can
   read what your autopilot will do, including you.
2. **The decision is on-chain.** The keeper carries no logic: it simulates `tick` and submits only when the contract
   itself says an action applies. A malicious or broken keeper cannot invent an action.
3. **The key is scoped by a contract.** The agent key lives on the user's own smart account under a policy contract
   that allowlists the exact calls, pins the user's own position, restricts transfer recipients, rate limits, and
   expires. The user keeps the passkey; the agent gets a leash.

XOXNO lending is the first integration. The same engine is meant to point at swaps, perpetual DEXs and anything
else with a contract interface.

---

## Architecture

Two diagrams: who talks to whom, and what one autopilot run looks like end to end.

```mermaid
graph TD
    subgraph User["The user"]
        P["Passkey<br/>WebAuthn secp256r1"]
        W["Smart account<br/>OpenZeppelin, wasm 1b5f4534…<br/>rule 0: passkey · rule N: agent key + policy"]
    end

    subgraph Koul["Koul contracts"]
        R["koul_router<br/>CD5VSBUX…AO2D<br/>set_autopilot · next_action · tick · check"]
        POL["koul_agent_policy<br/>CAKEUMCI…KKNZ<br/>enforce per auth context, tick sessions"]
        FX["koul_mock_fx<br/>CB6VNXAD…MKW2<br/>Reflector read interface"]
    end

    subgraph XOXNO["XOXNO lending"]
        C["Controller CCXRWJ6S…V3F3<br/>supply · withdraw · repay · borrow<br/>get_health_factor · get_collateral_amount"]
        PL["Pool CBSGF6QO…ZB5A<br/>get_deposit_rate · get_sync_data"]
        NFT["Position NFT CDVN5JU6…LPSY<br/>one token per account"]
    end

    subgraph Off["Off-chain, holds nothing"]
        K["Keeper<br/>GitHub Actions or a laptop<br/>simulate tick, submit if an action comes back"]
        F["Web app<br/>Next.js, @koul/core"]
        A["Anchor module<br/>landing accounts, SEP-1/10/12/38/6"]
    end

    P -->|signs| W
    F -->|"set_autopilot, grant agent, supply, withdraw"| W
    W -->|"root auth"| R
    K -->|"tick(user, id), agent Ed25519 signature"| W
    W -->|"every auth context"| POL
    POL -->|allow or reject| W
    R -->|reads| PL
    R -->|reads| FX
    R -->|"supply · withdraw · repay"| C
    C --> NFT
    F -->|reads| R
    F -->|"TRY in and out"| A
    A -->|"USDC"| W
```

```mermaid
sequenceDiagram
    participant U as User + passkey
    participant App as Web app
    participant SA as Smart account
    participant POL as koul_agent_policy
    participant R as koul_router
    participant X as XOXNO controller
    participant K as Keeper

    Note over U,App: Once, to arm
    U->>App: "Put my idle USDC to work, exit if the lira passes 50"
    App->>App: POST /api/autopilot/parse, validated against the contract's limits
    U->>SA: passkey: rules.add(agent key, koul_agent_policy, account id, expiry)
    U->>SA: passkey: router.set_autopilot(user, id, Autopilot)
    SA->>R: set_autopilot stores the ordered rules

    Note over K,X: Every pass, no user present
    K->>R: simulate tick(user, id)
    R-->>K: Option<Executed> or None
    alt None
        K-->>K: skip, no fee spent
    else An action applies
        K->>SA: submit tick, signed by the agent Ed25519 key
        SA->>POL: enforce(context) for the root call and every sub-invocation
        POL-->>SA: allowlisted call, pinned account, allowed recipient, under the rate limit
        SA->>R: tick(user, id)
        R->>X: get_health_factor, get_collateral_amount, get_borrow_amount
        R->>R: first rule that is true, off cooldown, and resolves to a real amount
        R->>X: supply / withdraw / repay, amounts snapped to 0.01 USDC
        R-->>SA: Fired event with the observed values
        SA-->>K: transaction hash
        App->>R: Activity reads the Fired events
    end
```

---

## Components

| Component | Where | Responsibility |
|---|---|---|
| **`koul_router`** | `contracts/koul_router` | The rule engine. Stores an ordered `Autopilot` per user and id, evaluates conditions against live reads, and executes at most one action per tick. Actions include swaps through the XOXNO aggregator, from the wallet or from XOXNO collateral, with the route supplied by the keeper and checked by the router: token pair, input amount, and a floor of the Reflector price less the rule's slippage. `set_autopilot` and `clear_autopilot` need the user's auth; `tick` needs the user's auth, which the agent key satisfies through the policy; `check` is a read-only view the UI uses for live evaluation, and `next_action` tells the keeper when a tick needs a swap route. Upgradeable by its admin so the address, and therefore every user's policy allowlist, stays stable. |
| **`koul_agent_policy`** | `contracts/koul_agent_policy` | Implements OpenZeppelin's `Policy` trait. Attached to the agent's context rule, it runs on the root call and on every sub-invocation: the `(contract, function)` pair must be allowlisted, `transfer` recipients must be allowlisted, XOXNO calls must name the user's own pinned account id, `withdraw` must send to the smart account itself, a swap must name the smart account as sender, and a rolling window rate limit caps how often the key may be used. The key acts only inside a router tick: `tick` opens a session for that ledger, every other call needs it, and the router closes it before returning, so the agent key cannot call XOXNO, a token or the aggregator directly. |
| **`koul_mock_fx`** | `contracts/koul_mock_fx` | Reflector's read interface (`lastprice`) plus an admin `set_price`, because no Reflector testnet feed carries TRY. One `set_oracle` call on the router swaps it for the real Reflector contract on mainnet. |
| **User smart account** | deployed per user | OpenZeppelin smart account, the same wasm Sembol and smart-account-kit deploy (`1b5f4534…`). Rule 0 holds the user's WebAuthn passkey. A second context rule holds Koul's Ed25519 agent key bound to `koul_agent_policy` with an expiry. Revoking that rule stops everything instantly. |
| **Keeper** | `keeper/` | The only off-chain moving part. Enumerates users with `list_users`, their autopilots with `list_ids`, simulates `tick`, and submits only when the contract returns an action, signing with the agent key and passing one context rule id per auth context. It also republishes the mock oracle price on testnet. It holds no user funds and makes no decisions. |
| **Frontend** | `web/` | Next.js app. Reads everything through `@koul/core`; writes are unsigned transactions the user signs with their passkey. Sentence-to-rules calls a server route that talks to a model and validates the result against the contract's limits before it can reach a signature. |
| **`@koul/core`** | `packages/core` | The typed SDK both the app and the keeper use: schemas that mirror the contract types, the ScVal codec, validation, reads, unsigned write builders, the permission derivation for the arm sheet, and the anchor module. |
| **Anchor module** | `packages/core/src/anchor`, `packages/core/src/funds.ts` | The TRY on and off ramp. Creates an ownerless landing account per transfer, runs the SEP handshake, forwards to the smart account with a pre-authorized transaction and merges itself away. Ported from Kumbara (MIT, see `LICENSE-KUMBARA`). |
| **Oracle admin** | `oracle-admin/` | A separate app on its own deployment that moves the mock USD/TRY price. Deliberately not part of the user app. |

---

## Stellar integrations

**XOXNO lending** (testnet). The router calls the controller for writes and both the controller and the pool for
reads:

- Controller writes, all with `caller = the user's smart account`: `supply(caller, account_id, spoke_id, assets)`,
  `withdraw(caller, account_id, withdrawals, to)`, `repay(caller, account_id, payments)`. The app also builds
  `borrow` for the user's own passkey, used to set up the health-guard demo.
- Controller reads: `get_health_factor(account_id)`, `get_collateral_amount(account_id, hub_asset)`,
  `get_borrow_amount(account_id, hub_asset)`.
- Pool reads: `get_deposit_rate`, `get_borrow_rate`, `get_sync_data` (cash and `max_utilization`),
  `get_supplied_amount`, `get_borrowed_amount`.
- Position NFT: `balance(owner)`, `get_owner_token_id(owner, index)`, `owner_of(token_id)`, `token_uri(token_id)`.
  The token id **is** the XOXNO account id, which is how the app finds a wallet's position without storing anything.
- Markets are `HubAssetKey { asset, hub_id }` rows in one pool. Koul uses spoke 3, hubs 1 and 2 for USDC, and the
  home page lists every testnet market XOXNO publishes.

**TR anchor** (`tr-mock-anchor.fly.dev`), TRY to USDC and back:

- **SEP-1** to discover the endpoints, **SEP-10** to authenticate as the landing account, **SEP-12** for the customer
  record, **SEP-38** for a firm quote, **SEP-6** `deposit-exchange` and `withdraw-exchange` for the transfer itself.
- The anchor refuses contract addresses, so each transfer gets an **ownerless landing account**: a classic G-account
  whose signers are removed after its forward and cleanup transactions are pre-authorized. The keeper sponsors the
  reserves and fee-bumps; nobody can redirect the funds, including us.
- Deposit: lira in by FAST, anchor pays the landing account, the pre-authorized forward moves USDC to the smart
  account, the account merges itself away. Withdrawal: one passkey-signed transfer to the landing account, then a
  pre-authorized payment to the anchor treasury with the memo, then cleanup.

**Reflector.** The router reads prices through Reflector's interface (`lastprice(asset) -> PriceData`) with a
staleness limit per rule. No Reflector testnet feed carries TRY, so `koul_mock_fx` implements the same interface and
`set_oracle` swaps it on mainnet. XOXNO itself prices collateral through Reflector, which is visible in a tick's
diagnostics.

**OpenZeppelin smart accounts.** `stellar-accounts` at rev `1e513890`, deployed wasm `1b5f4534…`, driven from
TypeScript with **smart-account-kit 0.6.2** and, in the browser, **@sembol/passkey-react 0.4.0** on Sembol's testnet
preset (wallet creation and passkey-signed calls are fee-sponsored through the public SDF relayer). Verifiers:
WebAuthn `CC7EKIHQ…OM3F`, Ed25519 `CAAVTMCB…HKN4`. Contracts build with **soroban-sdk 26.1**, Rust **1.91.1**,
stellar CLI **27.0.0**; the app uses **@stellar/stellar-sdk 16.0.1** and **Next.js 16**.

**Sembol.** Used for the passkey wallet layer, and contributed back: a pull request adding agent-permission hooks and
components to `@sembol/passkey-react` (`useAgentPermission`, `<GrantAgentAccess />`, `<AgentPermissions />`), with
tests, stories and docs: https://github.com/keyboord01/sembol/pull/3

---

## Key design decisions and trade-offs

**Session key on the user's own account, not a vault.** A vault would have been easier: deposit funds, let the
contract move them. We rejected it because the moment funds sit in our contract we are a custodian, and a bug is
everyone's loss. Instead the user keeps custody and grants a scoped, expiring key. The cost is complexity: every
action is an auth tree the smart account must validate, and one context rule id per auth context.

**A custom policy contract rather than a signer with a spending limit.** The policy allowlists `(contract, function)`
pairs, pins the user's own XOXNO account id, forces `withdraw` to return funds to the smart account, restricts USDC
transfer recipients to the XOXNO pool, and rate limits per rolling window. This is what makes "the agent can only do
what the rules need" a property of the chain rather than a promise. The trade-off is that adding a new action means
a new allowlist entry, so an armed autopilot cannot silently gain powers.

**Priority-ordered rules with one level of AND or OR, no if/else.** An autopilot is an ordered list; each rule has
one to three conditions joined by all or any, one action, one cooldown. On each tick the first rule that is true,
off cooldown, and has something real to do runs, and the tick stops. This is less expressive than a scripting
language and far easier to read, to validate on-chain, and to show honestly in a UI. Nesting was the first thing we
cut after testing the wording with people.

**Mandatory cooldowns.** Every rule carries one. Without it a true condition would fire every pass and grind a
position into dust through fees and rounding. The cooldown is stored per rule and enforced by the contract, not by
the keeper.

**The landing-account pattern for the anchor.** Anchors do not accept contract addresses, so a naive bridge would
mean an account someone controls. An ownerless account with pre-authorized forward and cleanup keeps the honest
property: from the moment it exists, the only transactions it can ever submit are the two we published.

**Agents propose, the user approves.** The sentence parser never signs anything. It returns data that is validated
against the contract's limits, shown as rule cards with the live values beside them, and only becomes state after
the user's passkey. Cashing out to lira is deliberately outside the agent's powers: a rule can bring USDC back to
the wallet, and the user confirms the TRY withdrawal themselves.

---

## Technical challenges and how we solved them

**One `context_rule_id` per authorization context.** The smart account's `__check_auth` receives the root call plus
every sub-invocation; a router tick is three or four contexts. Passing one id fails with
`ContextRuleIdsLengthMismatch`. The keeper walks the auth tree and repeats the rule id for each context.

**Auth trees bake exact arguments while positions accrue interest every ledger.** An amount read during simulation
is already stale at execution. Every amount is snapped down to 0.01 USDC, moves under 1 USDC are skipped, and
repayments round the debt up by one grain so a signed amount stays valid for hours; the controller refunds the
excess.

**A hub only releases its liquid cash, and never past its utilisation ceiling.** XOXNO answers with errors 112 and
127. `withdrawable()` caps by cash and by `borrowed / (supplied - w) <= max_utilization`, minus a grain of margin.

**No TRY on any Reflector testnet feed.** We implemented Reflector's read interface in `koul_mock_fx` rather than
inventing our own, so mainnet is a single `set_oracle` call.

**No protocol-native scheduler on Soroban.** SoroCron exists, but its executor contract is the invoker, so it cannot
carry a user's smart account authorization. Hence our own keeper, which is deliberately dumb.

**Two copies of one library broke every signature.** `@koul/core` had its own install of the Stellar SDK, so an
`xdr.ScVal` built inside it was not an instance of the class the wallet kit checks, and every passkey action died
with a generic "something went wrong". One pnpm workspace, one physical copy, fixed it. Errors now surface the
chain's own message instead of a wrapper's.

**WebAuthn allows one ceremony at a time.** Arming runs up to three prompts in a row; a second prompt starting while
one was open aborted both. A module-wide lock serialises them, and a dismissed prompt is reported as a cancellation
rather than a failure.

**A tick can lose a race with an oracle round.** XOXNO's health-factor read touches a Reflector round key that
changes every five minutes, so a tick simulated just before the boundary can fail at execution with "outside of the
footprint". The next pass succeeds; the keeper treats it as any other failed submission and spends nothing.

---

## Deployed contracts (Stellar testnet)

| Contract | Address | WASM hash |
|---|---|---|
| `koul_router` | [`CD5VSBUXQ4OQIVYI55CFF4C4YKSFQUY4OTFIOFJRNC6TUILMNN7MAO2D`](https://stellar.expert/explorer/testnet/contract/CD5VSBUXQ4OQIVYI55CFF4C4YKSFQUY4OTFIOFJRNC6TUILMNN7MAO2D) | `54d4f5b48b822b5fac4c462c8d1b1f5ddc13ca28eeacbbe58abf30aac516dc01` |
| `koul_agent_policy` | [`CAKEUMCIW4KBQZI5OJMFHFGM5VHDZHWIXAO7JOKTBRPR63IHIEP7KKNZ`](https://stellar.expert/explorer/testnet/contract/CAKEUMCIW4KBQZI5OJMFHFGM5VHDZHWIXAO7JOKTBRPR63IHIEP7KKNZ) | `136b671b879d2d6688b0edd291c5e89d464d155dc79992f5fe63e5dde2ee4e89` |
| `koul_mock_fx` | [`CB6VNXADXR3XHCS4EKV5ZR5UJUZYQ5BZTPRHCNQE3XMKQMB4LJG6MKW2`](https://stellar.expert/explorer/testnet/contract/CB6VNXADXR3XHCS4EKV5ZR5UJUZYQ5BZTPRHCNQE3XMKQMB4LJG6MKW2) | `68d24e0791f6c6dac01f97ff048eac19f431905bb9de63cf139bbdf1d38532f0` |

Contracts we integrate with, for reference:

| Contract | Address |
|---|---|
| XOXNO controller | [`CCXRWJ6SIU2WPFEGLFGJVITPL57QAYIMIO6OAM2NBGNDQSSCK2FFV3F3`](https://stellar.expert/explorer/testnet/contract/CCXRWJ6SIU2WPFEGLFGJVITPL57QAYIMIO6OAM2NBGNDQSSCK2FFV3F3) |
| XOXNO pool | [`CBSGF6QOQAMPFBEVSYPEQHSZRIHJ6RCGUPCRDMUX36DEKRWFAO2PZB5A`](https://stellar.expert/explorer/testnet/contract/CBSGF6QOQAMPFBEVSYPEQHSZRIHJ6RCGUPCRDMUX36DEKRWFAO2PZB5A) |
| XOXNO position NFT | [`CDVN5JU675MEDPVRPCYC45AHFC275UH57WEU5OTFE4WFGZBNN7HTLPSY`](https://stellar.expert/explorer/testnet/contract/CDVN5JU675MEDPVRPCYC45AHFC275UH57WEU5OTFE4WFGZBNN7HTLPSY) |
| XOXNO swap aggregator | [`CDNTWMWW2WGYTKIZTJYNGNVQQZI4KTC5BQRZ3275KESRX5T4O3AYECL5`](https://stellar.expert/explorer/testnet/contract/CDNTWMWW2WGYTKIZTJYNGNVQQZI4KTC5BQRZ3275KESRX5T4O3AYECL5), routes from `testnet-stellar-swap.xoxno.com` |
| Reflector CEX feed (XLM, USDC prices for swap floors) | [`CCYOZJCOPG34LLQQ7N24YXBM7LL62R7ONMZ3G6WZAAYPB5OYKOMJRN63`](https://stellar.expert/explorer/testnet/contract/CCYOZJCOPG34LLQQ7N24YXBM7LL62R7ONMZ3G6WZAAYPB5OYKOMJRN63) |
| USDC (SAC) | [`CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`](https://stellar.expert/explorer/testnet/contract/CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA) |
| Smart account wasm | `1b5f4534a76322da2ad7c745f6900857a6802b0ca79850c35a03561df997785a` |
| WebAuthn verifier | [`CC7EKIHQP3TN4CARQDND6CEOY2UXLWWC2X5GHTD5NLAT7BG5GPZIOM3F`](https://stellar.expert/explorer/testnet/contract/CC7EKIHQP3TN4CARQDND6CEOY2UXLWWC2X5GHTD5NLAT7BG5GPZIOM3F) |
| Ed25519 verifier | [`CAAVTMCBXEIBPR64EAASKFXERVPYFZA2JYP5A3BG6PESWEFUJX5IHKN4`](https://stellar.expert/explorer/testnet/contract/CAAVTMCBXEIBPR64EAASKFXERVPYFZA2JYP5A3BG6PESWEFUJX5IHKN4) |

Keeper account `GAFHZTSL63YZYU35SCHDOGOMXQ25266DBQYG7KETG6HC2AHBIZMGXP6U` pays fees and sponsors landing accounts.
Agent key `GBVD753EJMRQYI6WQCWC4OMDCNMGQMHXRT7IOAHTT3FD7ON6OQXTSAK3` is the one users grant; it holds nothing.

Every on-chain change, with transaction hashes, is in [`docs/build-log.md`](docs/build-log.md); the go/no-go gates
that came before are in [`docs/phase0.md`](docs/phase0.md).

---

## Setup, run and test

**Prerequisites.** Rust 1.91.1 with the `wasm32v1-none` target, stellar CLI 27.0.0, Node 20, pnpm 8. `scripts/env.sh`
pins the CLI and toolchain: `source scripts/env.sh` before any contract work. Contracts build only with
`stellar contract build`; a bare `cargo build --target wasm32v1-none` fails because soroban-sdk's spec shaking needs
the CLI.

```sh
git clone https://github.com/koul-me/koul && cd koul
pnpm install            # one workspace: web, keeper, packages/core, oracle-admin
```

**Environment.** `keeper/.env` (see `keeper/.env.example`): `KEEPER_SECRET` and `AGENT_SECRET` are funded testnet
secrets; `ROUTER_V1`, `KOUL_POLICY`, `MOCK_FX` are the addresses above. `web/.env.local`: `ANTHROPIC_API_KEY` or
`OPENAI_API_KEY` for the sentence parser, `KEEPER_SECRET` for the demo funds routes. `oracle-admin` needs
`ORACLE_ADMIN_SECRET`. Nothing secret is ever exposed under a `NEXT_PUBLIC_` name.

**USD/TRY.** Rules on USD/TRY read `koul_mock_fx`, a price the team moves by hand, so the app ships with them off:
no USD/TRY condition in the editor, the templates, the chat or the parser, and a save that carries one is refused.
`NEXT_PUBLIC_KOUL_FX=on` (read at build time, `web/lib/fx.ts`) brings them back, and with it the demo runner
(`NEXT_PUBLIC_KOUL_DEMO=1`).

**Waitlist.** `NEXT_PUBLIC_KOUL_WAITLIST=open` collects emails on the landing (email field, with Open app beside it)
and leaves the app open to anyone. `NEXT_PUBLIC_KOUL_WAITLIST=closed` (or `1`) also closes the app: every app page shows the waitlist in place (`web/proxy.ts`,
rules in `web/lib/app-host.ts`) and the landing's Open app becomes an email field. The landing stays open.
`KOUL_INVITE_CODES` (comma-separated) are the way in: `app.koul.me/?invite=<code>` sets a 90-day cookie and drops the
parameter; taking a code out of the list revokes it. `cd web && pnpm invite-codes 5 judge` makes five new codes with
their links and the value to append on Vercel (Production), then redeploy. Signups go to Upstash Redis through `POST /api/waitlist` (`KV_REST_API_URL` and
`KV_REST_API_TOKEN`, or the `UPSTASH_REDIS_REST_*` names), as the sorted set `koul:waitlist` scored by join time,
with the source in the hash `koul:waitlist:from`; read the list in the Upstash console's Data Browser. A new
signup sends two emails through Resend (`RESEND_API_KEY`, from the Vercel integration, sending domain koul.me): a
confirmation to the person, and a notice to `WAITLIST_NOTIFY_TO`. A repeat signup sends nothing.
The notice carries an Approve link (`/api/waitlist/approve`, signed per email with `WAITLIST_SECRET`): opening it shows
a confirm page, and its button makes a personal code (`inv-xxxxxxxx`, kept in Redis as `koul:invite:<code>` and
`koul:waitlist:approved`) and emails the person an invite link with the code. The first use of a personal code sets a
signed cookie, so the proxy only reads Redis when `?invite=` is in the address. Deleting `koul:invite:<code>` stops
new browsers; browsers already in keep access until the cookie expires or `WAITLIST_SECRET` changes. "Have a code?"
under the waitlist field, on the landing and the waitlist page, takes either kind of code. The flag is read at build time, so changing it needs a redeploy.

**Contracts.**

```sh
source scripts/env.sh
stellar contract build                      # all three
cd contracts/koul_router && cargo test      # 10 unit and scenario tests
stellar contract upload --wasm target/wasm32v1-none/release/koul_router.wasm --source <identity> --network testnet
stellar contract invoke --id CD5VSBUXQ4OQIVYI55CFF4C4YKSFQUY4OTFIOFJRNC6TUILMNN7MAO2D \
  --source <identity> --network testnet -- upgrade --new_wasm_hash <hash>
```

The router is upgraded in place so its address, and therefore every user's policy allowlist, never changes.

**Frontend.** `cd web && pnpm dev` on http://localhost:3000. **Oracle admin.** `cd oracle-admin && pnpm dev` on
port 3100. **Keeper.**

```sh
cd keeper
pnpm keeper:once              # one pass over every user and autopilot
pnpm keeper -- --interval 30  # the demo loop: reacts within seconds
```

In this repo the keeper also runs itself: `.github/workflows/keeper.yml` ticks every five minutes and on demand,
with the two secrets stored as GitHub repository secrets. Two keepers are safe; whichever loses a race simulates to
`None` and spends nothing.

**Tests.**

```sh
cd contracts/koul_router && cargo test    # rule evaluation, ordering, cooldowns, amounts, registries
cd packages/core && pnpm test             # 14: codec round trips, validation, templates, parser boundaries
cd packages/core && pnpm parse-test       # live: four sentences, one of them impossible
cd packages/core && pnpm smoke            # live reads and unsigned writes against testnet
cd keeper && pnpm test && pnpm session-deny # landing accounts; the agent key rejected outside a tick
cd web && npx tsc --noEmit && npx next build
```

---

## Operations and the competition backend

**Keeper health.** After every pass the keeper writes a heartbeat to Redis (`koul:keeper:heartbeat`: when, wallets,
autopilots, submitted, failed). `GET /api/keeper/status` returns it with `healthy` and plain `problems`; the running
autopilot tile shows "Last check 12S ago". When the heartbeat is older than five minutes (or four intervals plus a
pass), or the lease guard reports a lease that needs a person, the route emails `KEEPER_ALERT_TO` (default
`WAITLIST_NOTIFY_TO`), at most once an hour. `.github/workflows/keeper-watch.yml` calls it every 10 minutes so the
alarm works with nobody on the site.

**Status page.** `koul.me/status` is public: one headline, the keeper's last check, pass time, autopilots watched,
trades in the last hour, and a day of pass time and trades (the keeper keeps one point per pass in
`koul:keeper:history`). `/status/private` adds problems, the last pass's failure reasons, every lease and the keeper
and channel balances; it exists only in a browser that opened `/api/status/unlock?key=<STATUS_SECRET>`.

**Lease guard.** `cd keeper && pnpm leases [--dry]` reads the instance and wasm lease of every contract Koul touches
(router, policy, oracles, verifiers, XOXNO, the aggregator, every token) and restores or extends anything under 30
days to 90, paid by the keeper account and never above 40 XLM an entry. It runs daily in
`.github/workflows/leases.yml` and leaves its report in Redis (`koul:leases`) for the keeper status.

**Rate limits.** The chat, parser, test USDC, Circle faucet, waitlist, funds and competition routes are limited per IP
(and per wallet for the money routes) with Upstash Ratelimit, `web/lib/rate-limit.ts`. A limiter outage lets
requests through.

**Competition.** Scoring rules and every shape live in `packages/core/src/competition.ts` (`@koul/core`):

- Value is idle USDC + USDC supplied minus borrowed on XOXNO + every swap token, XLM included, at the Reflector price
  (`excludeTokens` can leave tokens out). Money from outside (a classic account, another smart wallet,
  a mint) is netted out: `pnl = value - net inflows`, `return = pnl / net inflows`. Value already in a wallet that no
  flow in the network's event window explains becomes opening capital, so it can never count as profit.
- Flags (unranked): outside money above the `startingBasket` (token units valued at the entry's opening prices, 1%
  plus $1 slack; `startingCapitalUsd` without a basket), a rule on USD/TRY (the team's mock feed), or, with
  `autopilotOnly`, a move the autopilot did not make (the 1 USDC that opens the XOXNO account is allowed).
- Indexer: `cd keeper && pnpm competition [--loop --every 300]`; settings with `pnpm competition config <file.json>`
  (a `CompetitionConfig`), a manual entrant with `pnpm competition add <wallet> <handle>`. In production it runs from
  `.github/workflows/competition.yml` and stops at once while no competition is configured.

Routes for the frontend (types in `@koul/core`):

| Route | Returns |
|---|---|
| `GET /api/competition` | `CompetitionInfo`: settings, verified entrants, last update |
| `GET /api/competition/leaderboard?offset=0&limit=50` | `Leaderboard`: ranked rows (`LeaderboardRow`), total |
| `GET /api/competition/entrant/:handle` | `EntrantView`: score, rank, value history every 15 minutes |
| `POST /api/competition/challenge` `{ wallet }` | a one-time challenge and the wallet's passkey credential ids |
| `POST /api/competition/register` `{ wallet, handle, email, assertion }` | the passkey signature confirms the entry and it is scored from then on; a "You're in" note is mailed best effort |
| `GET /api/competition/verify?token=` | confirmation links mailed before entries were confirmed by passkey; still honoured |

Entering takes one call from the app: `enterCompetition({ wallet, handle, email })` in `web/lib/competition-client.ts`
asks for the challenge, has the wallet's passkey sign it (one prompt) and registers. The server checks the signature
against the passkey public key the wallet stores on chain, so nobody can enter a wallet they do not control. One
entry per wallet, handle and email.

## How to evaluate

Everything below runs on https://app.koul.me against Stellar testnet. A passkey belongs to the origin it
was created on, so create a wallet on the domain rather than expecting a local one to appear.

1. **Create a wallet.** Press *Create wallet* and confirm with your device. No seed phrase appears because there is
   none: an OpenZeppelin smart account is deployed with your passkey as rule 0. Deployment and later signatures are
   fee-sponsored.
2. **Bring lira in.** *Funds → Deposit lira*, enter an amount, and the app opens a transfer through the anchor: a
   landing account is created, SEP-10, SEP-12, SEP-38 and SEP-6 run, and the FAST instructions the anchor returned
   appear with a reference. On the sandbox, press *Sandbox: pretend I sent the lira*. USDC lands in your wallet and
   the temporary account closes itself. Each step shows its technical detail and its transaction.
3. **Write a rule in a sentence.** *Autopilots → New autopilot*, type for example _"whenever I have at least 10 USDC
   sitting in my wallet put it into the pool that pays more, and repay my debt if my health drops under 1.25"_, and
   press *Turn into rules*. The rules appear as cards with the live value beside each condition and a mark on any
   value Koul filled in. Anything the router cannot do comes back as a note instead of an invented rule; try
   _"buy me gold when bitcoin dips"_ to see it refuse.
4. **Arm it.** The sheet lists exactly what Koul's key will be allowed to do, for how long, and how many
   confirmations it will take. Arming opens your XOXNO position if you have none, grants the scoped key, and stores
   the rules on-chain. Each step names its transaction.
5. **Watch it fire.** The keeper simulates `tick`; when a rule is true it submits. *Activity* shows the run in plain
   words with the observed values and a link to the transaction on stellar.expert. With `NEXT_PUBLIC_KOUL_FX=on`, a
   lira exit can be forced: open the oracle admin at https://koul-oracle.vercel.app/oracle and press *50.25 (lira
   shock)*, and within a pass the rule withdraws to your wallet.
6. **See an out-of-policy action rejected.** In the repo, `cd keeper && pnpm session-deny` sends three agent-signed
   calls straight at the contracts, each one an allowlisted call a tick makes: a swap on the aggregator, a withdrawal
   from XOXNO to the wallet, and a USDC transfer to the aggregator. Each is rejected with `7110 NoSession`, because the
   key only acts inside a router tick. Inside a tick the policy still checks every call: a `borrow` is not allowlisted
   (`7103`), a withdrawal must go to the wallet (`7109`), XOXNO calls must name the user's own account (`7108`). The
   rejections come from the chain, not from our code.
7. **Take lira out.** *Funds → Withdraw lira* with an IBAN. One passkey confirmation moves USDC to the landing
   account; the anchor pays out and the account cleans itself up. Cashing out is never something the agent can do.
8. **Read the rules yourself.** Everything is on-chain: `check(user, id)` returns per-condition truth and the live
   value each was compared against, and the router's `Fired` events carry what was observed at the moment it acted.

---

## Stellar skills used

The hackathon's skill pack shaped how we built. The ones we actually leaned on, by path:

| Skill | What we used it for |
|---|---|
| `skills/soroban/SKILL.md` | Contract structure, storage types and TTL, `require_auth` and auth trees, cross-contract clients, `contracterror` and `contractevent`, and the upgrade pattern that keeps the router's address fixed. |
| `skills/dapp/SKILL.md` | Building and simulating from TypeScript, `AssembledTransaction`, passkey smart accounts and the signing flow, and the error handling the UI now surfaces. |
| `skills/data/SKILL.md` | Reading chain state through Stellar RPC: simulation as a read, `getEvents` with topic filters, and the retention window that made our first Activity query fail. |
| `skills/standards/SKILL.md` | The SEP handshake for the anchor: SEP-1 discovery, SEP-10 authentication, SEP-12 customer data, SEP-38 quotes, SEP-6 deposit-exchange and withdraw-exchange. |
| `skills/deploy-stellar-mainnet/SKILL.md` | The mainnet checklist we are working against: what must be audited, monitored and swapped (`set_oracle` to real Reflector) before this leaves testnet. |
| `skills/agentic-payments/SKILL.md` | Background on agent-initiated payments on Stellar, which informed the "agent proposes, user approves" boundary and the scoped-key design. |

XOXNO's own contracts and configs (`XOXNO/rs-lending-xlm`) were the reference for hub and spoke semantics, market
parameters and the position NFT; the ABIs we fetched from testnet are in [`docs/abi/`](docs/abi).

---

## Roadmap toward SCF

**Next, in order.**

1. **A Koul MCP server.** Expose autopilots as tools so anyone can manage them by talking to their own AI assistant:
   read the portfolio, propose rules, explain what would fire and why. The server never holds funds or keys; it
   returns unsigned transactions the user signs with their passkey, which is the same boundary the web app uses.
2. **More protocols behind the same engine.** The router's conditions and actions are deliberately protocol-shaped
   rather than XOXNO-shaped. Swap venues come first (an action that routes through an aggregator), then perpetual
   DEXs, where conditional execution matters most: reduce exposure when funding flips, close when a level breaks.
3. **Mainnet with audited contracts.** The router and the policy are small and self-contained by design, which is
   what makes an audit affordable. The mock oracle disappears behind `set_oracle`; Reflector takes its place.
4. **A keeper anyone can run.** The keeper is already permissionless in effect: it only submits what the contract
   authorises. Publishing it with an incentive makes liveness independent of us.

**Funding.** We are applying to the Stellar Community Fund, Build Award, with the MCP server and the second protocol
integration as the milestones, and the audit as the tranche before mainnet.

---

## Team

- **Atahan Yıldırım**, cofounder — [github.com/atahanyild](https://github.com/atahanyild)
- **Ahmed Murshed**, cofounder

Contacts for judging are on the submission form; issues on this repository reach both of us.

---

## License and notes

This repository is MIT ([`LICENSE`](LICENSE)). One exception: `packages/core/src/anchor` and its keeper counterpart
are ported from [Kumbara](https://github.com/keyboord01/kumbara) (MIT, Sembol 2026), whose notice is kept in
[`LICENSE-KUMBARA`](LICENSE-KUMBARA) and in each file's header.

**XOXNO lending is PolyForm Noncommercial.** We do not vendor, fork or redistribute any XOXNO code. Koul calls the
deployed XOXNO contracts over the network like any other user, and the interfaces in [`docs/abi/`](docs/abi) were
fetched from the chain for reference.

Everything here runs on Stellar **testnet**. The FX oracle is a mock with the Reflector interface, and the anchor is
the TR Mock Anchor sandbox. No real money moves anywhere in this repository.

Build and operations notes that used to live in this file, including the run guide in more detail, are in
[`docs/README-build-guide.md`](docs/README-build-guide.md).
