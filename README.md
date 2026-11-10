# Koul

Trading rules that run from your own Stellar wallet.

You write a rule, for example "if XLM drops below $0.25, swap 50 USDC into it" or "if my loan health falls under 1.25,
repay from my wallet". A Soroban contract stores the rule, checks it and makes the trade from your passkey smart
account. You keep your funds. Our keeper only says "check now".

Koul is live on Stellar **testnet**.

| | |
|---|---|
| App | https://app.koul.me |
| Website | https://koul.me |
| Keeper status | https://koul.me/status |
| Architecture | [`docs/architecture.md`](docs/architecture.md) |
| Build log | [`docs/build-log.md`](docs/build-log.md), every on-chain change with its transaction |

---

## How it works

- **Rules live on-chain.** `koul_router` stores each user's autopilot (up to 32 rules, each with 1 to 3 conditions,
  one action and a cooldown). On every tick it re-reads the market, picks the first rule that is true and runs it in
  the same transaction.
- **The key can't go rogue.** Koul's session key sits on the user's own smart account under `koul_agent_policy`. It
  only works inside a router tick, only on the user's own positions, only to allowed recipients, and it is
  rate-limited and expires. The user removes it with one passkey signature.
- **The keeper is just a clock.** It simulates every autopilot for free and submits a tick only when the router says
  something is due. It holds no funds and makes no decisions.
- **No seed phrase.** Wallets are OpenZeppelin smart accounts with a passkey, built on
  [Sembol](https://github.com/keyboord01/sembol).

The full design, the security model and the known gaps are in [`docs/architecture.md`](docs/architecture.md).

## What works today

- **Lending rules on XOXNO:** supply idle USDC, move supply to the hub that pays more, repay when health drops,
  withdraw to the wallet.
- **Swaps through XOXNO's aggregator:** XLM, ETH, SOL, XRP, wBTC, BTC, USDT and EURC. The router sets the price floor
  from Reflector and reverts below it.
- **Price conditions** from Reflector.
- **A chat that drafts rules.** It returns data only. Nothing changes until the user reviews and signs.

## What's next

- **Mainnet:** a multisig router admin, an always-on keeper on Cloudflare Durable Objects with a fallback, backup
  passkeys, and a cap of $1,000 per account under automation for the first 60 days.
- **Indicators on-chain:** SMA, EMA, RSI and crossovers, computed by the router itself.
- **Trailing stops and brackets.**
- **Perpetuals on Zenex:** entries and exits on indicators, exits when funding flips, margin top-ups from XOXNO.
- **Faster prices:** Pyth Pro pull prices verified on-chain, with Reflector as a second source.
- **Safety limits:** a portfolio cap and a circuit breaker.
- **Backtesting** that runs the real router code over recorded prices.
- **A fee:** 0.10% of the value an executed action moves, capped at $5. No execution, no fee.

---

## Contracts on testnet

| Contract | Address |
|---|---|
| `koul_router` | [`CD5VSBUXQ4OQIVYI55CFF4C4YKSFQUY4OTFIOFJRNC6TUILMNN7MAO2D`](https://stellar.expert/explorer/testnet/contract/CD5VSBUXQ4OQIVYI55CFF4C4YKSFQUY4OTFIOFJRNC6TUILMNN7MAO2D) |
| `koul_agent_policy` | [`CAKEUMCIW4KBQZI5OJMFHFGM5VHDZHWIXAO7JOKTBRPR63IHIEP7KKNZ`](https://stellar.expert/explorer/testnet/contract/CAKEUMCIW4KBQZI5OJMFHFGM5VHDZHWIXAO7JOKTBRPR63IHIEP7KKNZ) |
| `koul_mock_fx` (testnet-only mock price feed, off in the app) | [`CB6VNXADXR3XHCS4EKV5ZR5UJUZYQ5BZTPRHCNQE3XMKQMB4LJG6MKW2`](https://stellar.expert/explorer/testnet/contract/CB6VNXADXR3XHCS4EKV5ZR5UJUZYQ5BZTPRHCNQE3XMKQMB4LJG6MKW2) |

Contracts Koul calls:

| Contract | Address |
|---|---|
| XOXNO controller | [`CCXRWJ6SIU2WPFEGLFGJVITPL57QAYIMIO6OAM2NBGNDQSSCK2FFV3F3`](https://stellar.expert/explorer/testnet/contract/CCXRWJ6SIU2WPFEGLFGJVITPL57QAYIMIO6OAM2NBGNDQSSCK2FFV3F3) |
| XOXNO pool | [`CBSGF6QOQAMPFBEVSYPEQHSZRIHJ6RCGUPCRDMUX36DEKRWFAO2PZB5A`](https://stellar.expert/explorer/testnet/contract/CBSGF6QOQAMPFBEVSYPEQHSZRIHJ6RCGUPCRDMUX36DEKRWFAO2PZB5A) |
| XOXNO position NFT | [`CDVN5JU675MEDPVRPCYC45AHFC275UH57WEU5OTFE4WFGZBNN7HTLPSY`](https://stellar.expert/explorer/testnet/contract/CDVN5JU675MEDPVRPCYC45AHFC275UH57WEU5OTFE4WFGZBNN7HTLPSY) |
| XOXNO swap aggregator | [`CDNTWMWW2WGYTKIZTJYNGNVQQZI4KTC5BQRZ3275KESRX5T4O3AYECL5`](https://stellar.expert/explorer/testnet/contract/CDNTWMWW2WGYTKIZTJYNGNVQQZI4KTC5BQRZ3275KESRX5T4O3AYECL5) |
| Reflector feed (swap floors) | [`CCYOZJCOPG34LLQQ7N24YXBM7LL62R7ONMZ3G6WZAAYPB5OYKOMJRN63`](https://stellar.expert/explorer/testnet/contract/CCYOZJCOPG34LLQQ7N24YXBM7LL62R7ONMZ3G6WZAAYPB5OYKOMJRN63) |
| USDC (SAC) | [`CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`](https://stellar.expert/explorer/testnet/contract/CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA) |
| WebAuthn verifier | [`CC7EKIHQP3TN4CARQDND6CEOY2UXLWWC2X5GHTD5NLAT7BG5GPZIOM3F`](https://stellar.expert/explorer/testnet/contract/CC7EKIHQP3TN4CARQDND6CEOY2UXLWWC2X5GHTD5NLAT7BG5GPZIOM3F) |
| Ed25519 verifier | [`CAAVTMCBXEIBPR64EAASKFXERVPYFZA2JYP5A3BG6PESWEFUJX5IHKN4`](https://stellar.expert/explorer/testnet/contract/CAAVTMCBXEIBPR64EAASKFXERVPYFZA2JYP5A3BG6PESWEFUJX5IHKN4) |

The keeper pays fees from `GAFHZTSL63YZYU35SCHDOGOMXQ25266DBQYG7KETG6HC2AHBIZMGXP6U`. Users grant the session key
`GBVD753EJMRQYI6WQCWC4OMDCNMGQMHXRT7IOAHTT3FD7ON6OQXTSAK3`, which holds nothing.

---

## Repository layout

| Path | What it is |
|---|---|
| `contracts/koul_router` | The rule engine |
| `contracts/koul_agent_policy` | The policy that limits Koul's session key |
| `contracts/koul_mock_fx` | Testnet-only mock price feed with Reflector's read interface |
| `contracts/noop_policy`, `contracts/deny_policy` | Early probes, kept for the record |
| `packages/core` | `@koul/core`, the TypeScript SDK the app and the keeper share |
| `keeper` | The keeper, plus scripts for leases, traction, the competition and the session-key check |
| `web` | The Next.js app |
| `oracle-admin` | A small testnet tool that sets the mock feed's price |
| `docs` | Architecture, build log, phase-0 log, operations, XOXNO ABIs |
| `scripts/env.sh` | Toolchain pins; source it before any build or deploy |

## Run it

**You need** Rust 1.91.1 with the `wasm32v1-none` target, stellar CLI 27.0.0, Node 20 and pnpm.

```sh
git clone https://github.com/koul-me/koul && cd koul
pnpm install                  # one workspace: web, keeper, packages/core, oracle-admin
source scripts/env.sh         # before any contract build or deploy
```

**Contracts.** Build only with `stellar contract build`. A bare `cargo build --target wasm32v1-none` fails, because
soroban-sdk needs the CLI's spec shaking.

```sh
stellar contract build
stellar contract upload --wasm target/wasm32v1-none/release/koul_router.wasm --source <identity> --network testnet
stellar contract invoke --id CD5VSBUXQ4OQIVYI55CFF4C4YKSFQUY4OTFIOFJRNC6TUILMNN7MAO2D \
  --source <identity> --network testnet -- upgrade --new_wasm_hash <hash>
```

The router is upgraded in place, so its address, and every user's policy allowlist, never changes.

**Keeper.** Copy `keeper/.env.example` to `keeper/.env` and set `KEEPER_SECRET` (pays fees) and `AGENT_SECRET` (the
session key users grant). `STELLAR_RPC_URL` picks the RPC provider; SDF's public RPC is used when it is unset.

```sh
cd keeper
pnpm keeper:once                  # one pass over every user and autopilot
pnpm keeper -- --interval 15      # loop: a new pass 15 seconds after the last one ends
```

In this repo the keeper runs on GitHub Actions (`.github/workflows/keeper.yml`). Each run lasts about 5 h 40 min and
starts its successor. Running two keepers is safe: the router checks cooldowns, so the slower one sends nothing.

**Web app.** `cd web && pnpm dev` serves http://localhost:3000. The rule chat needs `ANTHROPIC_API_KEY` or
`OPENAI_API_KEY` in `web/.env.local`. Nothing secret is ever exposed under a `NEXT_PUBLIC_` name. Passkeys belong to
the origin they were made on, so a wallet created on localhost only works on localhost.

**Tests.**

| Command | Result |
|---|---|
| `cd contracts/koul_router && cargo test` | 14 passed |
| `cd contracts/koul_agent_policy && cargo test` | 3 passed |
| `cd packages/core && pnpm test` | 63 passed |
| `cd keeper && pnpm test` | 9 passed |
| `cd web && pnpm test` | 136 passed |
| `cd keeper && pnpm session-deny` | Three direct calls with the session key, each rejected on-chain with `7110 NoSession` |

**Operations.** The keeper heartbeat, the status page, the lease guard, rate limits, traction, the competition
backend and the waitlist are described in [`docs/operations.md`](docs/operations.md).

---

## Team

- **Atahan Yıldırım**, cofounder: [github.com/atahanyild](https://github.com/atahanyild)
- **Ahmed Murshed**, cofounder: [github.com/keyboord01](https://github.com/keyboord01)

Issues on this repository reach both of us.

## License

MIT ([`LICENSE`](LICENSE)). One exception: `packages/core/src/anchor` and its keeper counterpart are ported from
[Kumbara](https://github.com/keyboord01/kumbara) (MIT), whose notice is kept in [`LICENSE-KUMBARA`](LICENSE-KUMBARA)
and in each file's header.

XOXNO lending is PolyForm Noncommercial. We don't vendor, fork or redistribute any XOXNO code. Koul calls XOXNO's
deployed contracts like any other user, and the interfaces in [`docs/abi/`](docs/abi) were fetched from the chain for
reference.

Everything here runs on Stellar testnet. No real money moves anywhere in this repository.
