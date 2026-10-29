/**
 * Competition indexer. For every verified entrant: read the wallet's token transfers since the last run, sort them
 * into outside money (the welcome grant, deposits, sends) and moves inside the wallet (swaps, supplies, repays), count
 * the moves the autopilot did not make, value the holdings at the Reflector price, and write the score. Then rank
 * everyone and write the board the web routes serve. Scoring rules: @koul/core competition.ts.
 *   pnpm competition [--loop] [--every 120]      index once, or every N seconds
 *   pnpm competition config <file.json>          store the competition settings (CompetitionConfig)
 *   pnpm competition add <wallet> <handle>       add an entrant by hand (testing, or a support case)
 * Without settings stored, it does nothing.
 */
import { readFileSync } from "node:fs";
import { Address, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import {
  COMP_KEYS, KoulReader, OPENING_TOLERANCE_USD, SWAP_TOKENS, rpcMessage, USDC_TESTNET, XOXNO_POSITION_NFT, counterpartyKind, flagsFor, rank, score, valueUsd,
  type CompetitionConfig, type EntrantRecord, type EntrantScore, type EntryState, type Flow, type LeaderboardRow, type Prices, type ScoredToken,
} from "@koul/core";
import { TESTNET, XOXNO, keeperKeypair, loadEnv } from "../src/lib/common";
import { pipeline, redis } from "../src/lib/status";

const env = loadEnv();
const server = new rpc.Server(TESTNET.rpcUrl);
const REFLECTOR = "CCYOZJCOPG34LLQQ7N24YXBM7LL62R7ONMZ3G6WZAAYPB5OYKOMJRN63";
const ROUTER = env.ROUTER_V1 ?? "CD5VSBUXQ4OQIVYI55CFF4C4YKSFQUY4OTFIOFJRNC6TUILMNN7MAO2D";
const ALL_TOKENS: ScoredToken[] = [{ ...USDC_TESTNET, feed: null }, ...SWAP_TOKENS.map((t) => ({ symbol: t.symbol, id: t.id, decimals: t.decimals, feed: t.feed }))];
/** Set per run from the settings: every wallet gets 10,000 test XLM for fees, which is gas, not capital. */
let TOKENS: ScoredToken[] = ALL_TOKENS;
let BY_ID = new Map(TOKENS.map((t) => [t.id, t]));
/** Opening the XOXNO account at the first Start autopilot supplies 1 USDC by hand; that one is not a manual move. */
const ACCOUNT_OPENING_USDC = 1_0000000n;
const HISTORY_EVERY_MS = 15 * 60_000;
const PARALLEL = 8;
const PAGE = 200;

const reader = new KoulReader({
  rpcUrl: TESTNET.rpcUrl, networkPassphrase: TESTNET.networkPassphrase, publicKey: keeperKeypair(env).publicKey(),
  router: ROUTER, oracle: env.MOCK_FX ?? "CB6VNXADXR3XHCS4EKV5ZR5UJUZYQ5BZTPRHCNQE3XMKQMB4LJG6MKW2",
  controller: XOXNO.controller, pool: XOXNO.pool, usdc: XOXNO.usdc, xlm: TESTNET.xlmSac, positionNft: XOXNO_POSITION_NFT,
});

const stamp = () => new Date().toISOString();
const parse = <T>(v: unknown): T | null => (typeof v === "string" ? (JSON.parse(v) as T) : null);

// ---- Contract kinds: is this C-address another smart wallet (outside money) or a protocol (inside)? ----

const wasmOf = new Map<string, string | null>();
async function wasmHash(contract: string): Promise<string | null> {
  if (wasmOf.has(contract)) return wasmOf.get(contract)!;
  let hash: string | null = null;
  try {
    const key = xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({ contract: new Address(contract).toScAddress(), key: xdr.ScVal.scvLedgerKeyContractInstance(), durability: xdr.ContractDataDurability.persistent() }));
    const entry = (await server.getLedgerEntries(key)).entries[0];
    const exec = entry?.val.contractData().val().instance().executable();
    hash = exec && exec.switch().name === "contractExecutableWasm" ? exec.wasmHash().toString("hex") : null;
  } catch { /* unknown counts as a protocol */ }
  wasmOf.set(contract, hash);
  return hash;
}

// ---- Events ----

const sym = (s: string) => xdr.ScVal.scvSymbol(s).toXDR("base64");
const addr = (a: string) => new Address(a).toScVal().toXDR("base64");
const groups = <T>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/**
 * Every event matching `filters` in [from, to]. The RPC searches a bounded stretch of ledgers per request and can
 * answer empty with more to search, so the range is walked in windows, each paged by cursor.
 */
const WINDOW = 5000;
async function events(from: number, to: number, filters: rpc.Api.EventFilter[]): Promise<rpc.Api.EventResponse[]> {
  const out: rpc.Api.EventResponse[] = [];
  for (let start = from; start <= to; start += WINDOW) {
    const end = Math.min(start + WINDOW - 1, to);
    let cursor: string | undefined;
    do {
      const res = cursor ? await server.getEvents({ cursor, limit: PAGE, filters }) : await server.getEvents({ startLedger: start, endLedger: end + 1, limit: PAGE, filters });
      for (const e of res.events) if (e.ledger <= end) out.push(e);
      cursor = res.events.length === PAGE && res.events[res.events.length - 1]!.ledger <= end ? res.cursor : undefined;
    } while (cursor);
  }
  return out;
}

const amountOf = (v: xdr.ScVal): bigint => {
  const n = scValToNative(v) as bigint | { amount: bigint };
  return typeof n === "bigint" ? n : BigInt(n.amount);
};

/** The wallet's transfers and mints of the scored tokens, and the transactions in which its autopilot fired. */
async function walletActivity(wallet: string, from: number, to: number) {
  const ids = TOKENS.map((t) => t.id);
  const [first, ...rest] = groups(ids, 5);
  const firedFilter: rpc.Api.EventFilter = { type: "contract", contractIds: [ROUTER], topics: [[sym("fired"), addr(wallet), "**"]] };
  const transferFilters = (g: string[]): rpc.Api.EventFilter[] => [
    { type: "contract", contractIds: g, topics: [[sym("transfer"), addr(wallet), "**"]] },
    { type: "contract", contractIds: g, topics: [[sym("transfer"), "*", addr(wallet), "**"]] },
    { type: "contract", contractIds: g, topics: [[sym("mint"), addr(wallet), "**"]] },
  ];
  // Up to five filters a request: the router's runs ride along with the first group of tokens.
  const all = [
    ...(await events(from, to, [...transferFilters(first ?? []), firedFilter])),
    ...(await Promise.all(rest.map((g) => events(from, to, transferFilters(g))))).flat(),
  ];
  const fired = new Set(all.filter((e) => e.contractId?.toString() === ROUTER).map((e) => e.txHash));
  return { transfers: all.filter((e) => e.contractId?.toString() !== ROUTER), fired };
}

// ---- One entry ----

/** Built-in token balances for every entrant, read in one or two ledger calls per run (SACs only). */
type SacBalances = Map<string, bigint>;
const ACCOUNT_RECHECK_MS = 10 * 60_000;

async function holdings(wallet: string, state: EntryState, sac: SacBalances, sacTokens: Set<string>) {
  const tokens: Record<string, bigint> = {};
  await Promise.all(TOKENS.map(async (t) => {
    // Custom (wasm) tokens keep their own storage layout, so they are still asked through a simulation.
    if (sacTokens.has(t.id)) { tokens[t.symbol] = sac.get(`${t.id}:${wallet}`) ?? 0n; return; }
    // A custom token can only have arrived through a transfer the indexer saw (or before the window, which the opening
    // value covers), so it is only read for wallets that have moved it.
    tokens[t.symbol] = state.tokensSeen?.includes(t.symbol) ? await reader.readTokenBalance(t.id, wallet).catch(() => 0n) : 0n;
  }));
  // The XOXNO account number only changes from none to one, so it is looked up once and then kept.
  if (state.accountId === undefined || (state.accountId === null && Date.now() - (state.accountCheckedAt ?? 0) > ACCOUNT_RECHECK_MS)) {
    const nft = await reader.readPositionNft(wallet).catch(() => undefined);
    if (nft !== undefined) { state.accountId = nft ? String(nft.tokenId) : null; state.accountCheckedAt = Date.now(); }
  }
  let supplied = 0n, borrowed = 0n;
  if (state.accountId) {
    for (const h of await reader.readHubAmounts(BigInt(state.accountId))) { supplied += h.collateral; borrowed += h.debt; }
  }
  return { tokens, supplied, borrowed };
}

async function indexEntry(rec: EntrantRecord, config: CompetitionConfig, latest: number, oldest: number, prices: Prices, walletWasm: Set<string>, sac: SacBalances, sacTokens: Set<string>): Promise<EntrantScore> {
  const state = parse<EntryState>(await redis(env, "GET", COMP_KEYS.totals(rec.wallet))) ?? { netInUsd: 0, inUsd: 0, outUsd: 0, manualTxs: 0, toLedger: config.startLedger - 1, lastHistoryAt: 0, flows: 0, openingUsd: Number.NaN, swapEdgeUsd: 0 };
  state.swapEdgeUsd ??= 0;
  const end = Math.min(latest, config.endLedger ?? latest);
  const from = Math.max(state.toLedger + 1, oldest);
  const newFlows: Flow[] = [];
  if (from <= end) {
    const { transfers, fired } = await walletActivity(rec.wallet, from, end);
    const internalByTx = new Map<string, { usdcToProtocol: bigint; other: boolean }>();
    /** Per transaction, the USD at the oracle price of what went out to protocols and what came back. */
    const swapLegs = new Map<string, { outUsd: number; inUsd: number; tokens: Set<string> }>();
    for (const e of transfers) {
      const token = BY_ID.get(e.contractId?.toString() ?? "");
      if (!token) continue;
      const topics = e.topic.map((t) => { try { return scValToNative(t) as unknown; } catch { return null; } });
      const kind = topics[0];
      const fromAddr = kind === "mint" ? null : String(topics[1]);
      const toAddr = kind === "mint" ? String(topics[1]) : String(topics[2]);
      const incoming = toAddr === rec.wallet;
      if (incoming && fromAddr === rec.wallet) continue;
      const counterparty = (incoming ? fromAddr : toAddr) ?? "mint";
      if (!(state.tokensSeen ??= []).includes(token.symbol)) state.tokensSeen.push(token.symbol);
      const amount = amountOf(e.value);
      const isWallet = (c: string) => walletWasm.has(wasmOf.get(c) ?? "");
      if (counterparty.startsWith("C")) await wasmHash(counterparty);
      const where = counterparty === "mint" ? "external" : counterpartyKind(counterparty, isWallet);
      const price = token.feed === null ? 1 : prices[token.feed] ?? 0;
      const usd = (Number(amount) / 10 ** token.decimals) * price;
      if (where === "external") {
        newFlows.push({ ledger: e.ledger, txHash: e.txHash, token: token.symbol, amount: (incoming ? amount : -amount).toString(), usd: incoming ? usd : -usd, counterparty });
        if (incoming) state.inUsd += usd; else state.outUsd += usd;
      } else {
        const legs = swapLegs.get(e.txHash) ?? { outUsd: 0, inUsd: 0, tokens: new Set<string>() };
        if (incoming) legs.inUsd += usd; else legs.outUsd += usd;
        legs.tokens.add(token.symbol);
        swapLegs.set(e.txHash, legs);
      }
      if (where !== "external" && !fired.has(e.txHash)) {
        const t = internalByTx.get(e.txHash) ?? { usdcToProtocol: 0n, other: false };
        if (token.symbol === "USDC" && !incoming) t.usdcToProtocol += amount; else t.other = true;
        internalByTx.set(e.txHash, t);
      }
    }
    for (const t of internalByTx.values()) if (t.other || t.usdcToProtocol > ACCOUNT_OPENING_USDC) state.manualTxs++;
    // A swap is a transaction with a token going out and a different one coming back. What came back above what went
    // out, both at the oracle price, is the venue's edge: capital, not profit. A swap that paid less is a real loss.
    for (const legs of swapLegs.values()) {
      if (legs.tokens.size >= 2 && legs.outUsd > 0 && legs.inUsd > legs.outUsd) state.swapEdgeUsd += legs.inUsd - legs.outUsd;
    }
    state.toLedger = end;
    state.flows += newFlows.length;
  }
  const h = await holdings(rec.wallet, state, sac, sacTokens);
  const value = valueUsd(h, TOKENS, prices);
  if (Number.isNaN(state.openingUsd ?? Number.NaN)) {
    const unexplained = value.usd - (state.inUsd - state.outUsd + state.swapEdgeUsd);
    state.openingUsd = unexplained > OPENING_TOLERANCE_USD ? unexplained : 0;
  }
  state.netInUsd = state.inUsd - state.outUsd + state.openingUsd + state.swapEdgeUsd;
  const { pnlUsd, returnPct } = score(value.usd, state.netInUsd);
  const flagReasons = flagsFor(state, config);
  const now = Date.now();
  const result: EntrantScore = {
    wallet: rec.wallet, handle: rec.handle, valueUsd: value.usd, pnlUsd, returnPct, netInUsd: state.netInUsd, inUsd: state.inUsd, outUsd: state.outUsd,
    manualTxs: state.manualTxs, unpriced: value.unpriced, swapEdgeUsd: state.swapEdgeUsd, flagged: flagReasons.length > 0, flagReasons, ledger: latest, updatedAt: now,
  };
  const writes: (string | number)[][] = [["SET", COMP_KEYS.score(rec.wallet), JSON.stringify(result)]];
  for (const f of newFlows) writes.push(["LPUSH", COMP_KEYS.flows(rec.wallet), JSON.stringify(f)]);
  if (newFlows.length) writes.push(["LTRIM", COMP_KEYS.flows(rec.wallet), 0, 499]);
  if (now - state.lastHistoryAt >= HISTORY_EVERY_MS) {
    writes.push(["RPUSH", COMP_KEYS.history(rec.wallet), JSON.stringify({ at: now, valueUsd: value.usd, returnPct })], ["LTRIM", COMP_KEYS.history(rec.wallet), -3000, -1]);
    state.lastHistoryAt = now;
  }
  writes.push(["SET", COMP_KEYS.totals(rec.wallet), JSON.stringify(state)]);
  await pipeline(env, writes);
  return result;
}

// ---- A run ----

async function prices(): Promise<Prices> {
  const out: Prices = {};
  const feeds = [...new Set(TOKENS.map((t) => t.feed).filter((f): f is string => f !== null))];
  await Promise.all(feeds.map(async (f) => {
    const r = await reader.readOracle(f, REFLECTOR).catch(() => null);
    if (r) out[f] = Number(r.price) / 10 ** r.decimals;
  }));
  return out;
}

/** False when no competition is configured, so a looping run can stop instead of idling for hours. */
async function run(): Promise<boolean> {
  const config = parse<CompetitionConfig>(await redis(env, "GET", COMP_KEYS.config));
  if (!config) { console.log(`${stamp()} competition: no settings stored, nothing to do`); return false; }
  const excluded = new Set(config.excludeTokens ?? ["XLM"]);
  TOKENS = ALL_TOKENS.filter((t) => !excluded.has(t.symbol));
  BY_ID = new Map(TOKENS.map((t) => [t.id, t]));
  const wallets = ((await redis(env, "SMEMBERS", COMP_KEYS.entrants)) as string[] | null) ?? [];
  if (wallets.length === 0) { console.log(`${stamp()} competition: no verified entrants yet`); return true; }
  const records = (await pipeline(env, wallets.map((w) => ["GET", COMP_KEYS.entrant(w)]))).map((v) => parse<EntrantRecord>(v)).filter((r): r is EntrantRecord => r !== null);
  const health = await server.getHealth();
  const latest = health.latestLedger!, oldest = (health.oldestLedger ?? 1) + 1;
  if (latest < config.startLedger) { console.log(`${stamp()} competition: starts at ledger ${config.startLedger}, now ${latest}`); return true; }
  const p = await prices();
  // Every entrant's wallet runs the same smart-account wasm; a transfer with one of those is between people.
  const walletWasm = new Set((await Promise.all(records.map((r) => wasmHash(r.wallet)))).filter((h): h is string => h !== null));
  // Built-in tokens (no wasm of their own) can be read from their ledger entries, all entrants at once.
  const sacTokens = new Set((await Promise.all(TOKENS.map(async (t) => ((await wasmHash(t.id)) === null ? t.id : null)))).filter((x): x is string => x !== null));
  const sac = await reader.readSacBalances([...sacTokens], records.map((r) => r.wallet)).catch(() => new Map<string, bigint>());
  const scores: EntrantScore[] = [];
  const started = Date.now();
  for (const g of groups(records, PARALLEL)) {
    scores.push(...(await Promise.all(g.map((r) => indexEntry(r, config, latest, oldest, p, walletWasm, sac, sacTokens).catch((err) => {
      console.log(`${stamp()} competition: ${r.handle} failed: ${rpcMessage(err)}`);
      return null;
    })))).filter((s): s is EntrantScore => s !== null));
  }
  const board: LeaderboardRow[] = rank(scores).map((s) => ({ rank: s.rank, handle: s.handle, wallet: s.wallet, valueUsd: s.valueUsd, pnlUsd: s.pnlUsd, returnPct: s.returnPct, flagged: s.flagged }));
  await pipeline(env, [["SET", COMP_KEYS.board, JSON.stringify(board)], ["SET", COMP_KEYS.updatedAt, Date.now()]]);
  const done = config.endLedger !== null && latest > config.endLedger;
  console.log(`${stamp()} competition: ${done ? "FINAL " : ""}${scores.length}/${records.length} entries scored in ${((Date.now() - started) / 1000).toFixed(1)}s at ledger ${latest}; top: ${board.slice(0, 3).map((b) => `${b.handle} ${b.returnPct?.toFixed(2) ?? "-"}%`).join(", ") || "none"}`);
  return true;
}

// ---- Commands ----

const [cmd, a1, a2] = process.argv.slice(2);
if (cmd === "config") {
  const config = JSON.parse(readFileSync(a1!, "utf8")) as CompetitionConfig;
  for (const k of ["id", "name", "startLedger", "startingCapitalUsd", "autopilotOnly"] as const) if (config[k] === undefined) throw new Error(`config needs ${k}`);
  await redis(env, "SET", COMP_KEYS.config, JSON.stringify(config));
  console.log(`stored: ${config.name}, ledgers ${config.startLedger} to ${config.endLedger ?? "open"}, ${config.startingCapitalUsd} USD each, autopilot only: ${config.autopilotOnly}`);
} else if (cmd === "add") {
  const rec: EntrantRecord = { wallet: a1!, handle: a2!, email: "", registeredAt: Date.now(), verifiedAt: Date.now() };
  await pipeline(env, [["SET", COMP_KEYS.entrant(rec.wallet), JSON.stringify(rec)], ["SET", COMP_KEYS.handle(rec.handle), rec.wallet], ["SADD", COMP_KEYS.entrants, rec.wallet]]);
  console.log(`added ${rec.handle} (${rec.wallet})`);
} else {
  const loop = process.argv.includes("--loop");
  const i = process.argv.indexOf("--every");
  const every = i > 0 ? Number(process.argv[i + 1]) : 120;
  let active = true;
  do {
    try { active = await run(); } catch (err) { console.log(`${stamp()} competition: run failed: ${rpcMessage(err)}`); }
    if (loop && active) await new Promise((r) => setTimeout(r, every * 1000));
  } while (loop && active);
}
