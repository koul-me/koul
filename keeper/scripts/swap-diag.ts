/**
 * Why a swap route is expensive: quote it, simulate execute_strategy for the swap wallet (or any sender, simulation
 * needs no signature), and print the resources and every footprint entry with its remaining TTL. Archived entries are
 * restored inside the transaction at the sender's expense.
 *   pnpm tsx scripts/swap-diag.ts [XLM|USDC] [amount] [maxHops] [maxSplits] [sender]
 */
import { Address, BASE_FEE, Contract, Keypair, TransactionBuilder, nativeToScVal, rpc, xdr } from "@stellar/stellar-sdk";
import { checkSwapDeployment, quoteSwap, XOXNO_SWAP } from "@koul/core";
import { TESTNET, XOXNO, loadState } from "../src/lib/common";

const [fromName = "XLM", amount = "10", hops = "6", splits = "4", senderArg] = process.argv.slice(2);
const from = fromName === "XLM" ? TESTNET.xlmSac : XOXNO.usdc;
const to = fromName === "XLM" ? XOXNO.usdc : TESTNET.xlmSac;
const s = loadState().swap as { contractId: string; deployerSecret: string };
const source = Keypair.fromSecret(s.deployerSecret).publicKey();
const server = new rpc.Server(TESTNET.rpcUrl);
await checkSwapDeployment();
const quote = await quoteSwap({ from, to, amountIn: BigInt(Math.round(Number(amount) * 1e7)), slippage: 0.01, maxHops: Number(hops), maxSplits: Number(splits) });
console.log(`route: ${quote.hops.map((h) => `${h.dex}:${h.pool.slice(0, 6)}`).join(" > ")}`);
const tx = new TransactionBuilder(await server.getAccount(source), { fee: BASE_FEE, networkPassphrase: TESTNET.networkPassphrase })
  .addOperation(new Contract(XOXNO_SWAP.router).call("execute_strategy", new Address(senderArg ?? s.contractId).toScVal(), nativeToScVal(quote.amountIn, { type: "i128" }), xdr.ScVal.scvBytes(xdr.ScVal.fromXDR(quote.routeXdr, "base64").toXDR()))).setTimeout(60).build();
const sim = await server.simulateTransaction(tx);
if (rpc.Api.isSimulationError(sim)) { console.log(`error: ${sim.error.slice(0, 6000)}`); process.exit(0); }
console.log(`minResourceFee ${Number(sim.minResourceFee) / 1e7} XLM, restore preamble: ${"restorePreamble" in sim && sim.restorePreamble ? "yes" : "no"}`);
const data = sim.transactionData.build();
const r = data.resources();
console.log(`instructions ${r.instructions()}, read bytes ${r.diskReadBytes()}, write bytes ${r.writeBytes()}, resource fee ${Number(data.resourceFee()) / 1e7} XLM`);
const fp = r.footprint();
const keys = [...fp.readOnly(), ...fp.readWrite()];
const latest = (await server.getLatestLedger()).sequence;
const entries = await server.getLedgerEntries(...keys);
const live = new Map(entries.entries.map((e) => [e.key.toXDR("base64"), e.liveUntilLedgerSeq]));
const archived = keys.filter((k) => !live.has(k.toXDR("base64")) || live.get(k.toXDR("base64"))! < latest).length;
console.log(`entries ${keys.length}, archived ${archived}`);
if (process.env.QUIET) process.exit(0);
for (const k of keys) {
  const t = k.switch().name;
  const label = t === "contractData" ? `data ${Address.fromScAddress(k.contractData().contract()).toString().slice(0, 8)} ${k.contractData().key().switch().name}` : t === "contractCode" ? `code ${k.contractCode().hash().toString("hex").slice(0, 8)}` : t;
  const until = live.get(k.toXDR("base64"));
  console.log(`${label.padEnd(40)} ${until === undefined ? "MISSING/ARCHIVED" : `live ${until - latest} ledgers`}`);
}
