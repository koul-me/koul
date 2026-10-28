/**
 * Koul keeper: every INTERVAL seconds, for every user the router lists and every autopilot they own, simulate
 * `router.tick(user, id)`. `None` or a failed simulation -> skip (no fee). Otherwise sign the smart-account auth
 * entries with the agent Ed25519 key (one context_rule_id per auth context) and submit. The keeper never decides
 * anything: the router evaluates the rules on-chain, and koul_agent_policy confines what the agent key can authorise.
 * The keeper keeps no per-user state: users come from `list_users`, autopilots from `list_ids`, the agent rule id from
 * the wallet's context rules. A swap rule needs a route, which only the XOXNO quote server can find: `next_action`
 * says when and for what amount, the keeper quotes it and passes the route to `tick`. The router checks the route's
 * pair, sets the amount itself and reverts below its own oracle floor, so a bad route costs a failed simulation, never
 * the user's funds.
 *   pnpm tsx src/keeper.ts [--once] [--interval 30] [--quiet]
 */
import { BASE_FEE, Contract, TransactionBuilder, contract, nativeToScVal, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import { checkSwapDeployment, quoteSwap, type Planned } from "@koul/core";
import { ForbiddenAuthenticator, RP_ID, ORIGIN, TESTNET, countContexts, describeEntries, json, keeperKeypair, loadEnv, loadState, makeKit } from "./lib/common";
import { writeHeartbeat } from "./lib/status";

const env = loadEnv();
const state = loadState();
const once = process.argv.includes("--once");
const quiet = process.argv.includes("--quiet");
const intervalArg = process.argv.indexOf("--interval");
const interval = intervalArg > 0 ? Number(process.argv[intervalArg + 1]) : 30;
const ROUTER = env.ROUTER_V1!;
const ORACLE = env.MOCK_FX;
const POLICY = env.KOUL_POLICY;
const FEED_MAX_AGE = 600;
const PARALLEL = 4;
const keeper = keeperKeypair(env);

/**
 * Testnet only: the mock oracle has no feed of its own, so the keeper republishes the last price when it is older than
 * FEED_MAX_AGE seconds. Rules reject prices older than their max_age_secs (900 s in the templates). With Reflector on
 * mainnet this function does not exist.
 */
async function refreshMockOracle(): Promise<void> {
  if (!ORACLE) return;
  const server = new rpc.Server(TESTNET.rpcUrl);
  const oracle = new Contract(ORACLE);
  const tryAsset = xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("Other"), xdr.ScVal.scvSymbol("TRY")]);
  const acc = await server.getAccount(keeper.publicKey());
  const read = new TransactionBuilder(acc, { fee: BASE_FEE, networkPassphrase: TESTNET.networkPassphrase }).addOperation(oracle.call("lastprice", tryAsset)).setTimeout(30).build();
  const sim = await server.simulateTransaction(read);
  if (!rpc.Api.isSimulationSuccess(sim)) return;
  const v = scValToNative(sim.result!.retval) as { price: bigint; timestamp: bigint } | null;
  if (!v) return;
  const age = Math.floor(Date.now() / 1000) - Number(v.timestamp);
  if (age < FEED_MAX_AGE) return;
  const built = new TransactionBuilder(await server.getAccount(keeper.publicKey()), { fee: BASE_FEE, networkPassphrase: TESTNET.networkPassphrase }).addOperation(oracle.call("set_price", tryAsset, nativeToScVal(v.price, { type: "i128" }))).setTimeout(60).build();
  const prepared = await server.prepareTransaction(built);
  prepared.sign(keeper);
  const sent = await server.sendTransaction(prepared);
  console.log(`${new Date().toISOString()} oracle   republished TRY price ${v.price} (was ${age}s old): ${sent.status} ${sent.hash}`);
}

interface Executed { rule_index: number; kind: string; amount: bigint; from_hub: number; to_hub: number }
interface ConditionState { holds: boolean; observed: bigint }
interface RuleState { ready: boolean; holds: boolean; conditions: ConditionState[]; last_fired: number }
type RouterClient = {
  list_users: () => Promise<contract.AssembledTransaction<string[]>>;
  list_ids: (a: { user: string }) => Promise<contract.AssembledTransaction<number[]>>;
  check: (a: { user: string; id: number }) => Promise<contract.AssembledTransaction<RuleState[]>>;
  tick: (a: { user: string; id: number; route?: Buffer }) => Promise<contract.AssembledTransaction<Executed | undefined>>;
  next_action: (a: { user: string; id: number }) => Promise<contract.AssembledTransaction<Planned | undefined>>;
};
/** Slippage asked of the quote server. The router's own floor, from its oracle, is what protects the user. */
const QUOTE_SLIPPAGE = 0.01;
let swapDeploymentChecked = false;
const router = (await contract.Client.from({ contractId: ROUTER, networkPassphrase: TESTNET.networkPassphrase, rpcUrl: TESTNET.rpcUrl, publicKey: keeper.publicKey() })) as unknown as RouterClient;

const stamp = () => new Date().toISOString();
const tag = (user: string, id: number) => `${user.slice(0, 8)}#${id}`;
const describe = (x: Executed) => x.kind.endsWith("swap")
  ? `${x.kind} rule ${x.rule_index} amount ${x.amount} of the input token${x.from_hub ? ` from hub ${x.from_hub}` : ""}`
  : `${x.kind} rule ${x.rule_index} amount ${(Number(x.amount) / 1e7).toFixed(2)} USDC hub ${x.from_hub} -> ${x.to_hub}`;
const describeState = (st: RuleState[]) => st.map((r, i) => `r${i}${r.ready ? "" : " cooling"}${r.holds ? " HOLDS" : ""}[${r.conditions.map((c) => `${c.holds ? "+" : "-"}${c.observed}`).join(" ")}]`).join(" ");

/**
 * A wallet whose policy refused a tick for its rate limit (#7106, 40 calls per 2,000 ledgers) is left alone for a
 * while: the refusal only shows at submit, so retrying every pass would spend the keeper account on doomed
 * transactions and hold up every other wallet (load test, 2026-10-28).
 */
const RATE_LIMIT_BACKOFF_MS = 15 * 60_000;
const backoffUntil = new Map<string, number>();

/**
 * The network keeps one pending transaction per source account, and every tick is paid by the keeper account, so
 * submissions go out one at a time; simulations still run in parallel.
 */
let submitQueue: Promise<unknown> = Promise.resolve();
function serially<T>(job: () => Promise<T>): Promise<T> {
  const run = submitQueue.then(job, job);
  submitQueue = run.catch(() => undefined);
  return run;
}

async function tickOne(user: string, id: number, agentRuleId: number, kit: ReturnType<typeof makeKit>, selected: Awaited<ReturnType<typeof kit.multiSigners.buildSelectedSigners>>): Promise<void> {
  const log = (m: string) => console.log(`${stamp()} ${tag(user, id)} ${m}`);
  if ((backoffUntil.get(tag(user, id)) ?? 0) > Date.now()) { pass.backedOff++; return; }
  let route: Buffer | undefined;
  try {
    const planned = (await router.next_action({ user, id })).result;
    if (planned?.needs_route) {
      if (!swapDeploymentChecked) { await checkSwapDeployment(); swapDeploymentChecked = true; }
      const q = await quoteSwap({ from: planned.token_in, to: planned.token_out, amountIn: BigInt(planned.amount), slippage: QUOTE_SLIPPAGE, maxHops: 3, maxSplits: 1 });
      const floor = BigInt(planned.min_out);
      if (q.amountOut < floor) {
        log(`swap rule ${planned.rule_index}: best route pays ${q.amountOut}, under the router's floor ${floor}; skipping`);
        return;
      }
      route = xdr.ScVal.fromXDR(q.routeXdr, "base64").toXDR();
      log(`swap rule ${planned.rule_index}: ${planned.amount} of ${planned.token_in.slice(0, 6)} -> ${planned.token_out.slice(0, 6)}, route ${q.hops.map((h) => `${h.dex}:${h.pool.slice(0, 6)}`).join(">")} expects ${q.amountOut}, floor ${floor}`);
    }
  } catch (err) {
    log(`no swap route, skipping: ${(err instanceof Error ? err.message : String(err)).replace(/\s+/g, " ").slice(0, 300)}`);
    return;
  }
  let tx: contract.AssembledTransaction<Executed | undefined>;
  try {
    tx = await router.tick({ user, id, route });
  } catch (err) {
    pass.skipped++;
    note(`sim ${(err instanceof Error ? err.message : String(err)).replace(/\s+/g, " ").slice(0, 80)}`);
    log(`simulation failed, skipping: ${(err instanceof Error ? err.message : String(err)).replace(/\s+/g, " ").slice(0, 300)}`);
    return;
  }
  const sim = (tx as { simulation?: rpc.Api.SimulateTransactionResponse }).simulation;
  if (!sim || rpc.Api.isSimulationError(sim)) {
    const codes = [...new Set((sim && rpc.Api.isSimulationError(sim) ? sim.error : "").match(/Error\(Contract, #\d+\)/g) ?? [])].join(",");
    pass.skipped++;
    note(`sim ${codes || "error"}`);
    log(`simulation error, skipping: ${codes || (sim && rpc.Api.isSimulationError(sim) ? sim.error.replace(/\s+/g, " ").slice(0, 200) : "no simulation")}`);
    return;
  }
  const result = tx.result;
  if (!result) {
    if (!quiet) {
      try { log(`tick -> None; ${describeState((await router.check({ user, id })).result)}`); } catch { log("tick -> None"); }
    } else {
      log("tick -> None");
    }
    return;
  }
  const op = tx.built?.operations[0];
  const entries = op && "auth" in op ? (op as { auth: xdr.SorobanAuthorizationEntry[] }).auth : [];
  if (entries.length === 0) { log("no auth entries in simulation, skipping"); return; }
  log(`tick -> ${describe(result)}; auth: ${describeEntries(entries).join(" | ")}`);

  let lastSim = "";
  const orig = kit.rpc.simulateTransaction.bind(kit.rpc);
  (kit.rpc as { simulateTransaction: typeof orig }).simulateTransaction = async (...a: Parameters<typeof orig>) => {
    const r = await orig(...a);
    if (rpc.Api.isSimulationError(r)) lastSim = r.error;
    return r;
  };
  const res = await serially(() => kit.multiSigners.operation(tx, selected, {
    forceMethod: "rpc",
    resolveContextRuleIds: (entry) => Array<number>(countContexts(entry.rootInvocation())).fill(agentRuleId),
  }));
  (kit.rpc as { simulateTransaction: typeof orig }).simulateTransaction = orig;
  if (!res.success) {
    const msg = `${lastSim} ${(res.error as { message?: string }).message ?? ""}`;
    const codes = [...new Set(msg.match(/Error\(Contract, #\d+\)/g) ?? [])].join(",");
    pass.failed++;
    if (codes.includes("#7106")) backoffUntil.set(tag(user, id), Date.now() + RATE_LIMIT_BACKOFF_MS);
    note(`submit ${codes || msg.replace(/\s+/g, " ").trim().slice(0, 80)}`);
    log(`submit FAILED ${codes || msg.replace(/\s+/g, " ").trim().slice(0, 300) || json(res.error).slice(0, 200)}`);
    return;
  }
  pass.submitted++;
  log(`submitted ${res.hash}`);
  const r = await kit.rpc.getTransaction(res.hash!);
  const ret = (r as { returnValue?: xdr.ScVal }).returnValue;
  if (ret) log(`on-chain result: ${json((tx as unknown as { parseResultXdr?: (v: xdr.ScVal) => unknown }).parseResultXdr?.(ret) ?? ret.switch().name)}`);
}

async function tickUser(user: string): Promise<void> {
  const log = (m: string) => console.log(`${stamp()} ${user.slice(0, 8)}   ${m}`);
  const ids = (await router.list_ids({ user })).result;
  if (ids.length === 0) { log("no autopilots"); return; }
  pass.autopilots += ids.length;
  const kit = makeKit(env, new ForbiddenAuthenticator(RP_ID, ORIGIN, state.passkey));
  await kit.connectWallet({ credentialId: "koul-keeper", contractId: user });
  kit.externalSigners.addEd25519FromSecret(env.AGENT_SECRET!);
  const rules = await kit.rules.list();
  // The newest live grant under the current policy: a wallet can still carry an older, narrower or expired one, and
  // a grant under the previous policy allowlists the previous router.
  const latest = (await kit.rpc.getLatestLedger()).sequence;
  const agentRules = rules
    .filter((r) => r.signers.some((s) => s.tag === "External" && s.values[0] === TESTNET.ed25519VerifierAddress))
    .filter((r) => !POLICY || r.policies.map(String).includes(POLICY))
    .filter((r) => !r.valid_until || Number(r.valid_until) > latest)
    .sort((x, y) => Number(x.id) - Number(y.id));
  if (agentRules.length === 0) { log("no live agent grant under the current policy, skipping"); return; }
  const agentRuleId = Number(agentRules[agentRules.length - 1]!.id);
  const selected = kit.multiSigners.buildSelectedSigners(await kit.multiSigners.getAvailableSigners(), null).filter((s) => s.type === "ed25519");
  if (selected.length !== 1) { log("agent key is not a signer on this wallet, skipping"); return; }
  for (const id of ids) {
    try { await tickOne(user, id, agentRuleId, kit, selected); } catch (err) { console.log(`${stamp()} ${tag(user, id)} error: ${err instanceof Error ? err.message : String(err)}`); }
  }
}

/** This pass's counts, reported as the heartbeat when it ends. */
const pass = { autopilots: 0, submitted: 0, failed: 0, skipped: 0, backedOff: 0, errors: [] as string[] };
const note = (reason: string) => { if (pass.errors.length < 5) pass.errors.push(reason.slice(0, 120)); };

do {
  const started = Date.now();
  Object.assign(pass, { autopilots: 0, submitted: 0, failed: 0, skipped: 0, backedOff: 0, errors: [] });
  try { await refreshMockOracle(); } catch (err) { console.log(`${stamp()} oracle refresh failed: ${err instanceof Error ? err.message : String(err)}`); }
  let users: string[] = [];
  try { users = (await router.list_users()).result; } catch (err) { console.log(`${stamp()} list_users failed: ${err instanceof Error ? err.message : String(err)}`); }
  if (users.length === 0) console.log(`${stamp()} no users registered on the router`);
  // A few wallets at a time keeps a pass short as users grow. Most ticks only simulate; when two submissions race on
  // the keeper's sequence, the loser fails and the next pass tries again.
  for (let i = 0; i < users.length; i += PARALLEL) {
    await Promise.all(users.slice(i, i + PARALLEL).map((u) => tickUser(u).catch((err) => { pass.failed++; note(`wallet ${err instanceof Error ? err.message : String(err)}`); console.log(`${stamp()} ${u.slice(0, 8)}   error: ${err instanceof Error ? err.message : String(err)}`); })));
  }
  let ledger = 0;
  try { ledger = (await new rpc.Server(TESTNET.rpcUrl).getLatestLedger()).sequence; } catch { /* the heartbeat goes out without it */ }
  await writeHeartbeat(env, { at: Date.now(), passMs: Date.now() - started, intervalSec: interval, wallets: users.length, ...pass, ledger });
  if (!once) await new Promise((r) => setTimeout(r, interval * 1000));
} while (!once);
