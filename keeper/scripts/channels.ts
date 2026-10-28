/**
 * The relay's channel accounts (web/lib/relay-server.ts): creates any that do not exist yet and tops up any under
 * MIN_XLM to TARGET_XLM, paid by the keeper account, in one classic transaction. Same derivation as the relay, so no
 * channel secret is ever stored.
 *   pnpm channels [--count 8]
 * Runs daily in .github/workflows/leases.yml.
 */
import { createHash } from "node:crypto";
import { Asset, BASE_FEE, Horizon, Keypair, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { TESTNET, keeperKeypair, loadEnv } from "../src/lib/common";

const MIN_XLM = 60;
const TARGET_XLM = 200;
const env = loadEnv();
const i = process.argv.indexOf("--count");
const count = i > 0 ? Number(process.argv[i + 1]) : Number(env.RELAY_CHANNELS ?? 8);
const keeper = keeperKeypair(env);
const horizon = new Horizon.Server("https://horizon-testnet.stellar.org");
const channel = (n: number) => Keypair.fromRawEd25519Seed(createHash("sha256").update(`koul-relay-channel:${n}:${env.KEEPER_SECRET}`).digest());

const ops = [];
for (let n = 0; n < count; n++) {
  const kp = channel(n);
  const balance = await horizon.loadAccount(kp.publicKey()).then((a) => Number(a.balances.find((b) => b.asset_type === "native")?.balance ?? 0)).catch(() => null);
  if (balance === null) {
    ops.push(Operation.createAccount({ destination: kp.publicKey(), startingBalance: String(TARGET_XLM) }));
    console.log(`channel ${n} ${kp.publicKey()} created with ${TARGET_XLM} XLM`);
  } else if (balance < MIN_XLM) {
    ops.push(Operation.payment({ destination: kp.publicKey(), asset: Asset.native(), amount: (TARGET_XLM - balance).toFixed(7) }));
    console.log(`channel ${n} ${kp.publicKey()} topped up from ${balance.toFixed(2)} XLM`);
  } else {
    console.log(`channel ${n} ${kp.publicKey()} ${balance.toFixed(2)} XLM`);
  }
}
if (ops.length) {
  const tx = new TransactionBuilder(await horizon.loadAccount(keeper.publicKey()), { fee: BASE_FEE, networkPassphrase: TESTNET.networkPassphrase });
  ops.forEach((op) => tx.addOperation(op));
  const built = tx.setTimeout(60).build();
  built.sign(keeper);
  const res = await horizon.submitTransaction(built);
  console.log(`funded in ${res.hash}`);
}
