/**
 * Traction collector for the private /status/traction page. Each run reads the router's events since the last one
 * (the first run reads from the oldest ledger the RPC still keeps, about seven days), folds them into per-day and
 * per-wallet numbers (@koul/core traction.ts), takes a live count from the router's views (users, autopilots, rules)
 * and writes it all in one pipeline. The RPC forgets events after seven days, so what Redis holds is the only history.
 *   pnpm traction          collect once
 *   pnpm traction --dry    read and print the numbers and the commands it would send, write nothing
 *   pnpm traction --dry --out <file>   also save the state and snapshot as JSON, to render the page locally
 *   pnpm traction --rebuild   count every event the RPC still keeps again from nothing (the live-count history
 *                             is kept): for a number added later, while the events it needs are still inside the
 *                             seven days. Everything older than that is lost from the new state, so check first.
 * Team wallets: the bots in TEAM_WALLETS are added to `koul:traction:team` here; tag another with
 * `SADD koul:traction:team <wallet>` (it leaves organic in every past day too).
 *
 * Redis budget (Upstash free plan, 500,000 commands a month, shared with the keeper and the indexer): GET the state,
 * SMEMBERS the team, then SET the state, LPUSH and LTRIM the snapshot (plus one SADD while a bot is missing from the
 * team set): 5 commands a run, 120 a day hourly. The state is one string, cursor included, so a run that fails before
 * its SET leaves the cursor and the numbers it covers as they were, and the next run reads the same events again.
 */
import { writeFileSync } from "node:fs";
import { rpc, scValToNative } from "@stellar/stellar-sdk";
import {
  KoulReader, SNAPSHOT_POINTS, TEAM_WALLETS, TRACTION_FEEDS, TRACTION_KEYS, XOXNO_POSITION_NFT, applyEvents, applyLive, cursorLedger, emptyTraction, groupOf, routerEvent, rpcMessage, snapshotOf, tractionSummary,
  type Prices, type RouterEvent, type TractionState,
} from "@koul/core";
import { TESTNET, XOXNO, loadEnv } from "../src/lib/common";
import { exec, pipeline, takeCommandCount } from "../src/lib/status";

const env = loadEnv();
const dry = process.argv.includes("--dry");
const rebuild = process.argv.includes("--rebuild");
const server = new rpc.Server(TESTNET.rpcUrl);
const REFLECTOR = "CCYOZJCOPG34LLQQ7N24YXBM7LL62R7ONMZ3G6WZAAYPB5OYKOMJRN63";
const ROUTER = env.ROUTER_V1 ?? "CD5VSBUXQ4OQIVYI55CFF4C4YKSFQUY4OTFIOFJRNC6TUILMNN7MAO2D";
/** The keeper's G-account, public and funded: only the source of read-only simulations, so no secret is needed. */
const SIM_SOURCE = "GAFHZTSL63YZYU35SCHDOGOMXQ25266DBQYG7KETG6HC2AHBIZMGXP6U";
const PAGE = 1000;
/** A week of ledgers is about 13 RPC windows; this only stops a cursor that never reaches the tip. */
const MAX_PAGES = 5000;
const PARALLEL = 8;
/** Upstash refuses a request over 1 MB; say so well before the state gets there. */
const STATE_WARN_BYTES = 800_000;

const reader = new KoulReader({
  rpcUrl: TESTNET.rpcUrl, networkPassphrase: TESTNET.networkPassphrase, publicKey: SIM_SOURCE,
  router: ROUTER, oracle: env.MOCK_FX ?? "CB6VNXADXR3XHCS4EKV5ZR5UJUZYQ5BZTPRHCNQE3XMKQMB4LJG6MKW2",
  controller: XOXNO.controller, pool: XOXNO.pool, usdc: XOXNO.usdc, xlm: TESTNET.xlmSac, positionNft: XOXNO_POSITION_NFT,
});

const stamp = () => new Date().toISOString();
const groups = <T>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const native = (v: Parameters<typeof scValToNative>[0]): unknown => { try { return scValToNative(v); } catch { return null; } };
const fmtUsd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

/**
 * Every router event after `from` up to the latest ledger. The RPC scans a bounded stretch of ledgers per request and
 * answers short, or empty, while more remain, so a short page proves nothing: it pages by cursor until a page brings
 * nothing and the cursor has reached the latest ledger.
 */
async function readEvents(from: { cursor: string } | { startLedger: number }): Promise<{ events: RouterEvent[]; cursor: string; latest: number; pages: number }> {
  const filters: rpc.Api.EventFilter[] = [{ type: "contract", contractIds: [ROUTER] }];
  const events: RouterEvent[] = [];
  let res = "cursor" in from ? await server.getEvents({ cursor: from.cursor, limit: PAGE, filters }) : await server.getEvents({ startLedger: from.startLedger, limit: PAGE, filters });
  let pages = 1;
  for (;;) {
    for (const e of res.events) {
      const ev = routerEvent(e.id, Date.parse(e.ledgerClosedAt), e.topic.map(native), native(e.value));
      if (ev) events.push(ev);
    }
    if (res.events.length === 0 && cursorLedger(res.cursor) >= res.latestLedger) break;
    if (pages >= MAX_PAGES) throw new Error(`events: no end after ${pages} pages, cursor at ledger ${cursorLedger(res.cursor)} of ${res.latestLedger}`);
    const prev = res.cursor;
    res = await server.getEvents({ cursor: res.cursor, limit: PAGE, filters });
    pages++;
    if (res.events.length === 0 && res.cursor === prev) break;
  }
  return { events, cursor: res.cursor, latest: res.latestLedger, pages };
}

/** Reflector prices for every feed a swap can start from; a feed that does not answer is left out (its swaps count $0). */
async function prices(): Promise<Prices> {
  const out: Prices = {};
  await Promise.all(TRACTION_FEEDS.map(async (f) => {
    const r = await reader.readOracle(f, REFLECTOR).catch(() => null);
    if (r) out[f] = Number(r.price) / 10 ** r.decimals;
  }));
  return out;
}

/**
 * Autopilots and rules stored now for every user `list_users` returns. A wallet whose views fail keeps its last count,
 * so one unreadable autopilot does not zero the chart or stop the run.
 */
async function liveCounts(prev: TractionState): Promise<{ live: Map<string, { autopilots: number; rules: number }>; failed: number }> {
  const users = await reader.listUsers();
  const before = new Map(prev.wallets.map((w) => [w.address, w.live]));
  const live = new Map<string, { autopilots: number; rules: number }>();
  let failed = 0;
  for (const g of groups(users, PARALLEL)) {
    await Promise.all(g.map(async (user) => {
      try {
        const aps = (await Promise.all((await reader.listIds(user)).map((id) => reader.readAutopilot(user, id)))).filter((a) => a !== null);
        live.set(user, { autopilots: aps.length, rules: aps.reduce((n, a) => n + a.rules.length, 0) });
      } catch (err) {
        failed++;
        live.set(user, before.get(user) ?? { autopilots: 0, rules: 0 });
        console.log(`${stamp()} traction: views for ${user} failed: ${rpcMessage(err)}`);
      }
    }));
  }
  return { live, failed };
}

async function run(): Promise<void> {
  // exec, not redis(): a failed read must stop the run, never look like a first run that starts the history over.
  const stored = (await exec(env, ["GET", TRACTION_KEYS.state])) as string | null;
  const team = new Set(((await exec(env, ["SMEMBERS", TRACTION_KEYS.team])) as string[] | null) ?? []);
  const prev: TractionState = stored && !rebuild ? (JSON.parse(stored) as TractionState) : emptyTraction(ROUTER);
  if (prev.router !== ROUTER) throw new Error(`the stored traction is for router ${prev.router}, not ${ROUTER}; DEL ${TRACTION_KEYS.state} to start over`);
  const health = await server.getHealth();
  const oldest = (health.oldestLedger ?? 1) + 1;
  if (rebuild && stored) {
    // The old history may start before what the RPC keeps now: a rebuild would silently drop those days.
    const was = JSON.parse(stored) as TractionState;
    const first = Math.min(...was.wallets.flatMap((w) => [w.firstSeen, w.lastTrade]).filter((t): t is number => t !== null));
    const closed = Number((health as { oldestLedgerCloseTime?: string }).oldestLedgerCloseTime ?? 0) * 1000;
    if (!closed || first < closed) throw new Error(`--rebuild would lose events from ${new Date(first).toISOString()}: the RPC now starts at ${closed ? new Date(closed).toISOString() : "an unknown time"}`);
  }
  let from: { cursor: string } | { startLedger: number };
  let state = prev;
  if (prev.cursor && cursorLedger(prev.cursor) >= oldest) from = { cursor: prev.cursor };
  else {
    // First run, or none for seven days: start at the oldest ledger kept and record what was missed.
    from = { startLedger: oldest };
    state = structuredClone(prev);
    if (prev.cursor) state.gaps.push({ fromLedger: cursorLedger(prev.cursor), toLedger: oldest - 1 });
    const closed = (health as { oldestLedgerCloseTime?: string }).oldestLedgerCloseTime;
    state.historyFrom ??= closed ? Number(closed) * 1000 : Date.now();
  }
  const started = Date.now();
  const read = await readEvents(from);
  const p = read.events.some((e) => e.type === "swapped") ? await prices() : {};
  const missing = read.events.some((e) => e.type === "swapped") ? TRACTION_FEEDS.filter((f) => p[f] === undefined) : [];
  if (missing.length) console.log(`${stamp()} traction: no Reflector price for ${missing.join(", ")}; swaps from those count $0`);
  const now = Date.now();
  state = applyEvents(state, read.events, p, now);
  const { live, failed } = await liveCounts(state);
  state = applyLive(state, live);
  state.cursor = read.cursor;
  state.toLedger = read.latest;
  state.updatedAt = now;
  const snapshot = snapshotOf(state, team, now, read.latest);
  const body = JSON.stringify(state);
  const commands: (string | number)[][] = [];
  const unseeded = TEAM_WALLETS.filter((w) => !team.has(w));
  if (unseeded.length) commands.push(["SADD", TRACTION_KEYS.team, ...unseeded]);
  commands.push(["SET", TRACTION_KEYS.state, body], ["LPUSH", TRACTION_KEYS.snapshots, JSON.stringify(snapshot)], ["LTRIM", TRACTION_KEYS.snapshots, 0, SNAPSHOT_POINTS - 1]);
  if (body.length > STATE_WARN_BYTES) console.log(`${stamp()} traction: WARNING state is ${(body.length / 1000).toFixed(0)} KB, Upstash refuses requests over 1 MB`);

  const sum = tractionSummary(state, [snapshot], team, [], now);
  const range = read.events.length ? `${read.events.length} events in ${read.pages} pages` : `no new events (${read.pages} pages)`;
  if (dry) {
    const o = sum.organic, t = sum.team;
    console.log(`\ntraction --dry, router ${ROUTER}, ledgers ${"cursor" in from ? `from cursor ${cursorLedger(from.cursor)}` : `from ${from.startLedger}`} to ${read.latest}: ${range}`);
    console.log(`history from ${state.historyFrom ? new Date(state.historyFrom).toISOString() : "-"}; ${state.wallets.length} wallets known, ${sum.loadTest} tagged load test, ${failed} view failures, ${state.unpriced} unpriced swaps`);
    console.log(`prices: ${Object.entries(p).map(([f, v]) => `${f} ${v}`).join(", ") || "not read"}`);
    console.log(`\n                        organic      team (+ load test)`);
    const line = (label: string, a: string | number, b: string | number) => console.log(`${label.padEnd(24)}${String(a).padEnd(13)}${b}`);
    line("users with an autopilot", o.users, t.users);
    line("live autopilots", o.autopilots, t.autopilots);
    line("rules", o.rules, t.rules);
    line("ever saved an autopilot", o.usersEver, t.usersEver);
    line("trades 24 h", o.trades24h, t.trades24h);
    line("trades 7 d", o.trades7d, t.trades7d);
    line("trades total", o.trades, t.trades);
    line("swaps", o.swaps, t.swaps);
    line("swap volume", fmtUsd(o.volumeUsd), fmtUsd(t.volumeUsd));
    line("paid out by pools", fmtUsd(o.volumeOutUsd), fmtUsd(t.volumeOutUsd));
    line("trades per autopilot", o.tradesPerAutopilot?.toFixed(2) ?? "-", t.tradesPerAutopilot?.toFixed(2) ?? "-");
    line("runs by kind", JSON.stringify(o.kinds), JSON.stringify(t.kinds));
    console.log(`\nday         new  users  trades  swaps   volume     active  saves  clears   | all wallets: new  trades  volume`);
    sum.days.organic.forEach((d, i) => {
      const a = sum.days.all[i]!;
      console.log(`${d.day}  ${String(d.newUsers).padStart(3)}  ${String(d.cumulativeUsers).padStart(5)}  ${String(d.trades).padStart(6)}  ${String(d.swaps).padStart(5)}  ${fmtUsd(d.volumeUsd).padStart(9)}  ${String(d.active).padStart(6)}  ${String(d.sets).padStart(5)}  ${String(d.clears).padStart(6)}   |  ${String(a.newUsers).padStart(14)}  ${String(a.trades).padStart(6)}  ${fmtUsd(a.volumeUsd).padStart(9)}`);
    });
    console.log(`\ntop wallets`);
    for (const w of sum.wallets.slice(0, 15)) console.log(`${w.address.slice(0, 4)}…${w.address.slice(-4)}  ${w.group.padEnd(8)}  first ${w.firstSeen ? new Date(w.firstSeen).toISOString().slice(0, 16) : "before history  "}  last ${w.lastTrade ? new Date(w.lastTrade).toISOString().slice(0, 16) : "-               "}  ${String(w.trades).padStart(4)} trades  ${fmtUsd(w.volumeUsd).padStart(10)}  ${w.rules} rules  ${w.tokens.join("/")}`);
    const untagged = state.wallets.filter((w) => groupOf(w, team) === "organic").sort((a, b) => (a.firstSeen ?? 0) - (b.firstSeen ?? 0));
    console.log(`\norganic wallets by first seen (tag any that are the team's: SADD ${TRACTION_KEYS.team} <wallet>)`);
    for (const w of untagged) console.log(`${w.address}  ${w.firstSeen ? new Date(w.firstSeen).toISOString().slice(0, 16) : "before history  "}  ${String(w.trades).padStart(4)} trades  ${w.tokens.join("/") || "-"}`);
    const out = process.argv.indexOf("--out");
    if (out > 0) { writeFileSync(process.argv[out + 1]!, JSON.stringify({ state, snapshots: [snapshot] })); console.log(`\nstate and snapshot saved to ${process.argv[out + 1]}`); }
    console.log(`\nwould send (one pipeline, ${commands.length} commands):`);
    for (const c of commands) console.log(`  ${c[0]} ${c[1]} ${c.length > 2 ? c.slice(2).map((x) => (String(x).length > 80 ? `<${String(x).length} bytes>` : x)).join(" ") : ""}`);
  } else {
    const results = await pipeline(env, commands);
    const set = results[commands.findIndex((c) => c[0] === "SET")];
    if (set !== "OK") console.log(`${stamp()} traction: the state did not reach Redis (KV_REST_API_URL / KV_REST_API_TOKEN?); nothing is stored`);
  }
  console.log(`${stamp()} traction: ${dry ? "DRY " : ""}${rebuild ? "REBUILD " : ""}${range} to ledger ${read.latest} in ${((Date.now() - started) / 1000).toFixed(1)}s; ${state.wallets.length} wallets, organic ${sum.organic.users} users / ${sum.organic.autopilots} autopilots / ${sum.organic.rules} rules / ${sum.organic.trades} trades, team ${sum.team.users} / ${sum.team.autopilots} / ${sum.team.rules} / ${sum.team.trades}; state ${(body.length / 1000).toFixed(1)} KB; ${takeCommandCount()} redis commands`);
}

try {
  await run();
} catch (err) {
  console.log(`${stamp()} traction: run failed: ${rpcMessage(err)}; ${takeCommandCount()} redis commands`);
  process.exitCode = 1;
}
