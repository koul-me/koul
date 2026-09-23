import "server-only";
import { Address, Asset, Contract, Keypair, Operation, TransactionBuilder, nativeToScVal, rpc, type Transaction } from "@stellar/stellar-sdk";
import { KOUL, XOXNO } from "@/lib/koul";

/**
 * Test USDC without the anchor. Each request makes a throwaway G account that friendbot funds with test XLM, buys
 * USDC with it on the testnet DEX, and sends the USDC to the smart wallet through the USDC contract. Nothing is
 * spent from the keeper; the throwaway account keeps its leftover XLM.
 */
const USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
export const TEST_USDC_AMOUNT = "100";
const AMOUNT_STROOPS = 100_0000000n;
/** The most test XLM the DEX leg may spend; friendbot gives 10,000. */
const SEND_MAX_XLM = "5000";
const FRIENDBOT = "https://friendbot.stellar.org";

const server = () => new rpc.Server(KOUL.rpcUrl);

async function submit(s: rpc.Server, tx: Transaction, what: string): Promise<string> {
  const sent = await s.sendTransaction(tx);
  if (sent.status === "ERROR") {
    let code = "unknown";
    try { code = sent.errorResult?.result().switch().name ?? "unknown"; } catch { /* keep unknown */ }
    throw new Error(`${what} was rejected: ${code}`);
  }
  const polled = await s.pollTransaction(sent.hash, { attempts: 30 });
  if (polled.status !== "SUCCESS") throw new Error(`${what} ${polled.status === "FAILED" ? "failed" : "was not confirmed"} (${sent.hash})`);
  return sent.hash;
}

export async function sendTestUsdc(wallet: string): Promise<{ wallet: string; amountUsdc: string; hash: string }> {
  if (!/^C[A-Z2-7]{55}$/.test(wallet)) throw new Error("A Stellar smart-wallet address is required");
  Address.fromString(wallet);
  const s = server();
  const temp = Keypair.random();

  const fb = await fetch(`${FRIENDBOT}?addr=${temp.publicKey()}`);
  if (!fb.ok) throw new Error(`Friendbot declined (${fb.status}); try again in a minute`);

  // One classic transaction: trust USDC, then buy exactly 100 USDC with test XLM on the DEX.
  const usdc = new Asset("USDC", USDC_ISSUER);
  const buy = new TransactionBuilder(await s.getAccount(temp.publicKey()), { fee: "10000", networkPassphrase: KOUL.networkPassphrase })
    .addOperation(Operation.changeTrust({ asset: usdc }))
    .addOperation(Operation.pathPaymentStrictReceive({ sendAsset: Asset.native(), sendMax: SEND_MAX_XLM, destination: temp.publicKey(), destAsset: usdc, destAmount: TEST_USDC_AMOUNT, path: [] }))
    .setTimeout(60).build();
  buy.sign(temp);
  await submit(s, buy, "Buying test USDC on the DEX");

  // Then the USDC contract moves it to the smart wallet; the temp account signs as the source.
  const call = new Contract(XOXNO.usdc).call("transfer", Address.fromString(temp.publicKey()).toScVal(), Address.fromString(wallet).toScVal(), nativeToScVal(AMOUNT_STROOPS, { type: "i128" }));
  const draft = new TransactionBuilder(await s.getAccount(temp.publicKey()), { fee: "10000", networkPassphrase: KOUL.networkPassphrase })
    .addOperation(call).setTimeout(60).build();
  const prepared = await s.prepareTransaction(draft);
  prepared.sign(temp);
  const hash = await submit(s, prepared as Transaction, "Sending test USDC to the wallet");
  return { wallet, amountUsdc: TEST_USDC_AMOUNT, hash };
}
