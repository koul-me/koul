/**
 * Lease guard. Reads the instance and wasm leases of every contract Koul depends on and extends any that has fewer
 * than MIN_DAYS left, paid by the keeper account. Testnet rent is expensive for large wasm (the XOXNO controller once
 * expired and every supply quoted 566 XLM), so an extension above MAX_FEE_XLM is not sent: it is reported and left to
 * a person. The report goes to Redis (`koul:leases`), where the web app's keeper status reads it and alerts.
 *   pnpm leases [--dry]
 * Runs daily from .github/workflows/leases.yml.
 */
import { Address, BASE_FEE, Operation, SorobanDataBuilder, TransactionBuilder, rpc, xdr } from "@stellar/stellar-sdk";
import { XOXNO_SWAP } from "@koul/core";
import { LEDGERS_PER_DAY, TESTNET, XOXNO, keeperKeypair, loadEnv } from "../src/lib/common";
import { LEASES_KEY, redis } from "../src/lib/status";

const MIN_DAYS = 30;
const EXTEND_DAYS = 90;
const MAX_FEE_XLM = 40;
const dry = process.argv.includes("--dry");

const env = loadEnv();
const server = new rpc.Server(TESTNET.rpcUrl);

/** Everything a tick, a save or a swap touches. Token ids mirror SWAP_TOKENS in web/lib/koul.ts. */
const CONTRACTS: Record<string, string> = {
  "koul router": env.ROUTER_V1 ?? "CD5VSBUXQ4OQIVYI55CFF4C4YKSFQUY4OTFIOFJRNC6TUILMNN7MAO2D",
  "koul policy": env.KOUL_POLICY ?? "CAKEUMCIW4KBQZI5OJMFHFGM5VHDZHWIXAO7JOKTBRPR63IHIEP7KKNZ",
  "mock FX oracle": env.MOCK_FX ?? "CB6VNXADXR3XHCS4EKV5ZR5UJUZYQ5BZTPRHCNQE3XMKQMB4LJG6MKW2",
  "Reflector feed": "CCYOZJCOPG34LLQQ7N24YXBM7LL62R7ONMZ3G6WZAAYPB5OYKOMJRN63",
  "Ed25519 verifier": TESTNET.ed25519VerifierAddress,
  "WebAuthn verifier": TESTNET.webauthnVerifierAddress,
  "XOXNO controller": XOXNO.controller,
  "XOXNO pool": XOXNO.pool,
  "XOXNO aggregator": XOXNO_SWAP.router,
  USDC: XOXNO.usdc,
  XLM: TESTNET.xlmSac,
  ETH: "CAEXCVZUCB6FGYKU6YAEUJMVCLS74SPSQ2TTEOLJ27A3C6C627OQON47",
  SOL: "CBVJ6GYJJ55ALTHN32OJEFGUZWWTMDFGIBCM42SPYQ4GWLKX2XARAP2N",
  XRP: "CBSUHSWWZS5MEAGET6ES7UWI5A4QEVABXP6XJXB4XIUMRKMBIN7MJZ5D",
  wBTC: "CBWPLT4YJFXFNDCZFUMCZZQ7UBM2FDIAXQNCM24NZODJDSJNUNMQ63PF",
  BTC: "CAOWDS3FQ4RKAY3LP7EBRAN7QO2ZFPNXH2ITT47FSTEXPDZRNQHEQFS2",
  USDT: "CDWFJXIZZFJ2CVGSAPZ5GWVEYCGDYE65XD2R7S4PWEDP2NFDWKNL4SWD",
  EURC: "CCIMRLN4JLJTGU62FG7IQUP4X5IIAFPBTJQ5AHBM7QQJDVXBJGN632PZ",
};

interface Lease { name: string; part: "instance" | "wasm"; days: number | null; action: "ok" | "extended" | "restored" | "too expensive" | "failed" | "missing" | "would extend" | "would restore"; tx?: string; feeXlm?: number; error?: string }

const instanceKey = (id: string) => xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({ contract: new Address(id).toScAddress(), key: xdr.ScVal.scvLedgerKeyContractInstance(), durability: xdr.ContractDataDurability.persistent() }));

/**
 * Sends one footprint operation for one entry: a restore when the entry is archived (its lease reads 0 and every call
 * that touches it fails until it is back), otherwise an extension to EXTEND_DAYS from now. Nothing above the fee cap.
 */
async function renew(key: xdr.LedgerKey, archived: boolean): Promise<Pick<Lease, "action" | "tx" | "feeXlm" | "error">> {
  const keeper = keeperKeypair(env);
  const data = archived ? new SorobanDataBuilder().setReadWrite([key]) : new SorobanDataBuilder().setReadOnly([key]);
  const op = archived ? Operation.restoreFootprint({}) : Operation.extendFootprintTtl({ extendTo: EXTEND_DAYS * LEDGERS_PER_DAY });
  const tx = new TransactionBuilder(await server.getAccount(keeper.publicKey()), { fee: BASE_FEE, networkPassphrase: TESTNET.networkPassphrase })
    .setSorobanData(data.build()).addOperation(op).setTimeout(60).build();
  const prepared = await server.prepareTransaction(tx);
  const feeXlm = Number(prepared.fee) / 1e7;
  if (feeXlm > MAX_FEE_XLM) return { action: "too expensive", feeXlm };
  if (dry) return { action: archived ? "would restore" : "would extend", feeXlm };
  prepared.sign(keeper);
  const sent = await server.sendTransaction(prepared);
  if (sent.status === "ERROR") return { action: "failed", feeXlm, error: JSON.stringify(sent.errorResult?.result().switch().name ?? sent.status) };
  const done = await server.pollTransaction(sent.hash);
  if (done.status !== "SUCCESS") return { action: "failed", tx: sent.hash, feeXlm, error: done.status };
  return { action: archived ? "restored" : "extended", tx: sent.hash, feeXlm };
}

const latest = (await server.getLatestLedger()).sequence;
const daysLeft = (until: number) => Math.round(((until - latest) / LEDGERS_PER_DAY) * 10) / 10;
const leases: Lease[] = [];

for (const [name, id] of Object.entries(CONTRACTS)) {
  const iKey = instanceKey(id);
  const inst = (await server.getLedgerEntries(iKey)).entries[0];
  if (!inst) { leases.push({ name, part: "instance", days: null, action: "missing" }); continue; }
  const targets: [Lease["part"], xdr.LedgerKey, number][] = [["instance", iKey, inst.liveUntilLedgerSeq ?? 0]];
  const exec = inst.val.contractData().val().instance().executable();
  // Token contracts built into the network (SACs) have no wasm of their own.
  if (exec.switch().name === "contractExecutableWasm") {
    const cKey = xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: exec.wasmHash() }));
    const code = (await server.getLedgerEntries(cKey)).entries[0];
    targets.push(["wasm", cKey, code?.liveUntilLedgerSeq ?? 0]);
  }
  for (const [part, key, until] of targets) {
    const days = until ? daysLeft(until) : null;
    if (days !== null && days >= MIN_DAYS) { leases.push({ name, part, days, action: "ok" }); continue; }
    try {
      const archived = until < latest;
      const first = await renew(key, archived);
      // A restored entry comes back with the network's minimum lease; extend it in the same run.
      if (first.action === "restored") {
        const then = await renew(key, false);
        leases.push({ name, part, days, ...then, action: then.action === "extended" ? "restored" : then.action, tx: `${first.tx} ${then.tx ?? ""}`.trim(), feeXlm: (first.feeXlm ?? 0) + (then.feeXlm ?? 0) });
      } else {
        leases.push({ name, part, days, ...first });
      }
    } catch (err) {
      leases.push({ name, part, days, action: "failed", error: (err instanceof Error ? err.message : String(err)).slice(0, 200) });
    }
  }
}

for (const l of leases) console.log(`${(l.name + " " + l.part).padEnd(30)} ${(l.days === null ? "?" : `${l.days} d`).padStart(8)}  ${l.action}${l.feeXlm !== undefined ? ` (${l.feeXlm} XLM)` : ""}${l.tx ? ` ${l.tx}` : ""}${l.error ? ` ${l.error}` : ""}`);
const report = { at: Date.now(), ledger: latest, minDays: MIN_DAYS, dry, leases };
if (!dry) await redis(env, "SET", LEASES_KEY, JSON.stringify(report));
const bad = leases.filter((l) => l.action === "failed" || l.action === "too expensive" || l.action === "missing");
if (bad.length) { console.log(`${bad.length} lease(s) need a person`); process.exitCode = 1; }
