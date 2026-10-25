/**
 * A live swap through the XOXNO aggregator from a smart account, signed by its passkey.
 *
 * Uses the keeper's headless wallet when `.phase0-state.json` has one under `swap`, otherwise creates one: a software
 * passkey and a friendbot-funded deployer (or KEEPER_SECRET when set) that also funds the wallet: XLM directly, USDC
 * bought on the classic DEX. Then it checks
 * the quote server's deployment, takes a fresh quote, verifies the route bytes against the request, builds
 * `execute_strategy(wallet, amount_in, route)`, signs with the passkey and reports the balances on both sides.
 * `--reverse` takes the pools of a quote in the opposite direction and walks them backwards, for a pair whose own best
 * route runs through archived pools (XLM -> USDC on testnet); the floor then comes from a simulation of that route.
 *   pnpm swap [XLM|USDC] [amount] [slippage] [--max-fee XLM] [--reverse]      e.g. pnpm swap USDC 1 0.01
 */
import { Address, Asset, BASE_FEE, Contract, Keypair, Operation, TransactionBuilder, nativeToScVal, rpc, scValToNative, type Transaction } from "@stellar/stellar-sdk";
import { KoulWriter, XOXNO_SWAP, checkSwapDeployment, pathRoute, quoteSwap, reverseHops, type SwapQuote } from "@koul/core";
import { SoftwareAuthenticator, type AuthenticatorState } from "../src/phase0/passkey";
import { ORIGIN, RP_ID, TESTNET, XOXNO, json, loadEnv, loadState, makeKit, saveState, step } from "../src/lib/common";

const TOKENS: Record<string, string> = { XLM: TESTNET.xlmSac, USDC: XOXNO.usdc };
const USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
/**
 * A swap costs well under 1 XLM, archived entries restored included. Far more means the network's rent price has
 * spiked, as it did on testnet on 2026-10-25 while the Soroban state was above its target size (a plain SAC transfer
 * was charged 26 XLM); `--max-fee <XLM>` accepts that deliberately.
 */
const maxFeeArg = process.argv.indexOf("--max-fee");
const MAX_RESOURCE_FEE = BigInt(Math.round((maxFeeArg > 0 ? Number(process.argv[maxFeeArg + 1]) : 5) * 1e7));
const reverse = process.argv.includes("--reverse");
const args = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && all[i - 1] !== "--max-fee");
const fromName = (args[0] ?? "XLM").toUpperCase();
const toName = fromName === "XLM" ? "USDC" : "XLM";
const amount = Number(args[1] ?? (fromName === "XLM" ? 10 : 1));
const slippage = Number(args[2] ?? 0.01);
if (!TOKENS[fromName] || !(amount > 0)) throw new Error("usage: pnpm swap [XLM|USDC] [amount] [slippage] [--max-fee XLM] [--reverse]");
const from = TOKENS[fromName]!;
const to = TOKENS[toName]!;
const amountIn = BigInt(Math.round(amount * 1e7));

interface SwapState { contractId: string; passkey: AuthenticatorState; deployerSecret: string }
const env = loadEnv();
const state = loadState();
const server = new rpc.Server(TESTNET.rpcUrl);
const fmt = (x: bigint) => (Number(x) / 1e7).toFixed(7);

async function friendbot(pub: string): Promise<void> {
  if (await server.getAccount(pub).then(() => true, () => false)) return;
  const res = await fetch(`https://friendbot.stellar.org/?addr=${pub}`);
  if (!res.ok) throw new Error(`friendbot failed for ${pub}: ${res.status}`);
}

async function balance(token: string, who: string, source: string): Promise<bigint> {
  const tx = new TransactionBuilder(await server.getAccount(source), { fee: BASE_FEE, networkPassphrase: TESTNET.networkPassphrase })
    .addOperation(new Contract(token).call("balance", new Address(who).toScVal())).setTimeout(30).build();
  const sim = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim)) throw new Error(`balance read failed: ${"error" in sim ? sim.error : "no result"}`);
  return BigInt(scValToNative(sim.result!.retval) as bigint);
}

async function send(tx: Transaction, what: string): Promise<string> {
  tx.sign(deployer);
  const sent = await server.sendTransaction(tx);
  const done = await server.pollTransaction(sent.hash, { attempts: 30 });
  if (done.status !== "SUCCESS") throw new Error(`${what} failed: ${done.status} ${sent.hash}`);
  return sent.hash;
}

/** XLM comes straight from the deployer. USDC is bought by the deployer on the classic DEX first, as the app's test faucet does. */
async function fundWallet(): Promise<void> {
  const want = amountIn + 10_000_000n;
  const builder = async () => new TransactionBuilder(await server.getAccount(deployer.publicKey()), { fee: "10000", networkPassphrase: TESTNET.networkPassphrase });
  if (fromName === "USDC") {
    const usdc = new Asset("USDC", USDC_ISSUER);
    const buy = (await builder()).addOperation(Operation.changeTrust({ asset: usdc }))
      .addOperation(Operation.pathPaymentStrictReceive({ sendAsset: Asset.native(), sendMax: "5000", destination: deployer.publicKey(), destAsset: usdc, destAmount: fmt(want), path: [] }))
      .setTimeout(60).build();
    console.log(`deployer bought ${fmt(want)} USDC on the DEX: ${await send(buy, "DEX buy")}`);
  }
  const call = new Contract(from).call("transfer", new Address(deployer.publicKey()).toScVal(), new Address(wallet).toScVal(), nativeToScVal(want, { type: "i128" }));
  const prepared = await server.prepareTransaction((await builder()).addOperation(call).setTimeout(60).build());
  console.log(`sent ${fmt(want)} ${fromName} to the wallet: ${await send(prepared as Transaction, "funding transfer")}`);
}

step("wallet");
let saved = state.swap as SwapState | undefined;
const deployer = saved ? Keypair.fromSecret(saved.deployerSecret) : env.KEEPER_SECRET ? Keypair.fromSecret(env.KEEPER_SECRET) : Keypair.random();
await friendbot(deployer.publicKey());
const authenticator = new SoftwareAuthenticator(RP_ID, ORIGIN, saved?.passkey);
const kit = makeKit({ ...env, KEEPER_SECRET: deployer.secret() }, authenticator);
if (saved) {
  await kit.connectWallet({ credentialId: saved.passkey.credentialId, contractId: saved.contractId });
  console.log(`reconnected ${saved.contractId}`);
} else {
  const created = await kit.createWallet("Koul", `swap-${Date.now()}`, { autoSubmit: true, forceMethod: "rpc" });
  if (!created.submitResult?.success) throw new Error(`deploy failed: ${json(created.submitResult)}`);
  saved = { contractId: created.contractId, passkey: authenticator.toState(), deployerSecret: deployer.secret() };
  state.swap = saved;
  saveState(state);
  console.log(`created ${created.contractId} tx ${created.submitResult.hash}`);
}
const wallet = saved.contractId;
if ((await balance(from, wallet, deployer.publicKey())) < amountIn) await fundWallet();
const before = { in: await balance(from, wallet, deployer.publicKey()), out: await balance(to, wallet, deployer.publicKey()) };
console.log(`before: ${fmt(before.in)} ${fromName}, ${fmt(before.out)} ${toName}`);
if (before.in < amountIn) throw new Error(`wallet holds ${fmt(before.in)} ${fromName}, needs ${fmt(amountIn)}`);

const writer = new KoulWriter({
  rpcUrl: TESTNET.rpcUrl, networkPassphrase: TESTNET.networkPassphrase, publicKey: deployer.publicKey(),
  router: env.ROUTER_V1 ?? "", oracle: env.MOCK_FX ?? "", controller: XOXNO.controller, pool: XOXNO.pool, usdc: XOXNO.usdc, xlm: TESTNET.xlmSac,
  policy: env.KOUL_POLICY ?? "", ed25519Verifier: TESTNET.ed25519VerifierAddress, spoke: XOXNO.spoke,
});

step("quote");
await checkSwapDeployment();
let quote: SwapQuote;
if (reverse) {
  // The pools a quote for the opposite swap found, walked backwards. A floor of one unit lets a simulation measure the
  // output; the route that is signed carries that output less the slippage.
  const opposite = await quoteSwap({ from: to, to: from, amountIn: 10_000_000n, slippage, maxHops: 3, maxSplits: 1 });
  const hops = reverseHops(opposite.hops);
  const probe = await writer.buildSwap(wallet, pathRoute({ from, to, amountIn, expectedOut: 1n, slippage: 0, hops }));
  quote = pathRoute({ from, to, amountIn, expectedOut: probe.result, slippage, hops });
} else {
  // One path of at most three hops: cheaper to run, and what XOXNO recommends when a route is composed into other calls.
  quote = await quoteSwap({ from, to, amountIn, slippage, maxHops: 3, maxSplits: 1 });
}
console.log(`router ${XOXNO_SWAP.router}, ${reverse ? "reversed route, floor from simulation" : `snapshot ledger ${quote.snapshotLedger}`}`);
console.log(`pay ${fmt(quote.amountIn)} ${fromName}, expect ${fmt(quote.amountOut)} ${toName}, at least ${fmt(quote.minOut)} (slippage ${slippage}), impact ${quote.priceImpact ?? "n/a"}`);
console.log(`route: ${quote.hops.map((h) => `${h.dex}:${h.pool.slice(0, 6)}`).join(" > ")}`);

step("swap");
const tx = await writer.buildSwap(wallet, quote);
const sim = (tx as { simulation?: rpc.Api.SimulateTransactionResponse }).simulation;
if (!sim || rpc.Api.isSimulationError(sim)) throw new Error(`simulation failed: ${sim && rpc.Api.isSimulationError(sim) ? sim.error : "no simulation"}`);
const fee = BigInt(sim.minResourceFee);
console.log(`simulated output ${fmt(tx.result)} ${toName}, resource fee ${fmt(fee)} XLM`);
if (fee > MAX_RESOURCE_FEE) throw new Error(`resource fee ${fmt(fee)} XLM is above --max-fee: the route restores or renews ledger entries (scripts/swap-diag.ts lists them)`);
const res = await kit.signAndSubmit(tx, { forceMethod: "rpc" });
state.swap = { ...saved, passkey: authenticator.toState() };
saveState(state);
if (!res.success) throw new Error(`submit failed: ${json(res.error)}`);
console.log(`submitted ${res.hash}`);

const after = { in: await balance(from, wallet, deployer.publicKey()), out: await balance(to, wallet, deployer.publicKey()) };
console.log(`after: ${fmt(after.in)} ${fromName} (${fmt(after.in - before.in)}), ${fmt(after.out)} ${toName} (+${fmt(after.out - before.out)})`);
if (after.out - before.out < quote.minOut) throw new Error("received less than the route's floor");
console.log(`https://stellar.expert/explorer/testnet/tx/${res.hash}`);
