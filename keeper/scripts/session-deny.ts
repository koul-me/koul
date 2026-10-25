/**
 * The agent key outside a tick: three calls signed by the agent alone and sent straight at the contracts, not through
 * the router, from the swap wallet (`pnpm swap-rules` grants the agent there). Each is an allowlisted call that a tick
 * makes, and each must be rejected with 7110 NoSession, because only a router tick opens the policy's session.
 *   1. aggregator.execute_strategy(wallet, 1 USDC, route)   a swap the keeper chose itself
 *   2. controller.withdraw(wallet, account, [(hub 1, 1 USDC)], Some(wallet))
 *   3. usdc.transfer(wallet, aggregator, 1 USDC)             the aggregator is an allowed recipient
 *   ROUTER_V1=C... pnpm session-deny
 */
import { Keypair, contract, rpc } from "@stellar/stellar-sdk";
import { KoulReader, KoulWriter, XOXNO_POSITION_NFT, XOXNO_SWAP, checkSwapDeployment, quoteSwap } from "@koul/core";
import { ForbiddenAuthenticator, ORIGIN, RP_ID, TESTNET, XOXNO, countContexts, json, loadEnv, loadState, makeKit } from "../src/lib/common";

interface SwapState { contractId: string; deployerSecret: string; agentSecret?: string; passkey: { credentialId: string } }
const env = loadEnv();
const saved = loadState().swap as SwapState | undefined;
if (!saved) throw new Error("no swap wallet: run pnpm swap and pnpm swap-rules first");
const wallet = saved.contractId;
const deployer = Keypair.fromSecret(saved.deployerSecret);
const agentSecret = env.AGENT_SECRET ?? saved.agentSecret;
if (!agentSecret) throw new Error("no agent key: run pnpm swap-rules first");
const kit = makeKit({ ...env, KEEPER_SECRET: deployer.secret() }, new ForbiddenAuthenticator(RP_ID, ORIGIN));
await kit.connectWallet({ credentialId: saved.passkey.credentialId, contractId: wallet });
kit.externalSigners.addEd25519FromSecret(agentSecret);
const agentRules = (await kit.rules.list()).filter((r) => r.signers.some((s) => s.tag === "External" && s.values[0] === TESTNET.ed25519VerifierAddress));
if (!agentRules.length) throw new Error("agent not granted on the swap wallet");
const ruleId = Number(agentRules.at(-1)!.id);
const selected = kit.multiSigners.buildSelectedSigners(await kit.multiSigners.getAvailableSigners(), null).filter((s) => s.type === "ed25519");
const base = { rpcUrl: TESTNET.rpcUrl, networkPassphrase: TESTNET.networkPassphrase, publicKey: deployer.publicKey(), router: env.ROUTER_V1 ?? "", oracle: "", controller: XOXNO.controller, pool: XOXNO.pool, usdc: XOXNO.usdc, xlm: TESTNET.xlmSac, positionNft: XOXNO_POSITION_NFT };
const writer = new KoulWriter({ ...base, policy: env.KOUL_POLICY ?? "", ed25519Verifier: TESTNET.ed25519VerifierAddress, spoke: XOXNO.spoke });
const nft = await new KoulReader(base).readPositionNft(wallet);
if (!nft) throw new Error("the swap wallet has no XOXNO position");
const codesIn = (s: string) => [...new Set(s.match(/Error\(Contract, #\d+\)/g) ?? [])].join(",");

let failures = 0;
async function attempt(label: string, build: () => Promise<contract.AssembledTransaction<unknown>>): Promise<void> {
  let outcome: string;
  try {
    const tx = await build();
    const sim = (tx as { simulation?: rpc.Api.SimulateTransactionResponse }).simulation;
    if (!sim || rpc.Api.isSimulationError(sim)) {
      outcome = `rejected before the policy: ${sim && rpc.Api.isSimulationError(sim) ? codesIn(sim.error) || sim.error.slice(0, 160) : "no simulation"}`;
    } else {
      const res = await kit.multiSigners.operation(tx, selected, { forceMethod: "rpc", resolveContextRuleIds: (entry) => Array<number>(countContexts(entry.rootInvocation())).fill(ruleId) });
      const msg = res.success ? "" : (res.error as { message?: string })?.message ?? json(res.error);
      outcome = res.success ? `SUBMITTED ${res.hash}` : codesIn(msg) || msg.replace(/\s+/g, " ").slice(0, 200);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    outcome = codesIn(msg) || msg.replace(/\s+/g, " ").slice(0, 200);
  }
  const ok = outcome.includes("#7110");
  if (!ok) failures++;
  console.log(`${ok ? "rejected" : "UNEXPECTED"}  ${label}: ${outcome}`);
}

await checkSwapDeployment();
const quote = await quoteSwap({ from: XOXNO.usdc, to: TESTNET.xlmSac, amountIn: 10_000_000n, slippage: 0.01, maxHops: 3, maxSplits: 1 });
type Call = (a: Record<string, unknown>) => Promise<contract.AssembledTransaction<unknown>>;
const controller = (await contract.Client.from({ contractId: XOXNO.controller, networkPassphrase: TESTNET.networkPassphrase, rpcUrl: TESTNET.rpcUrl, publicKey: deployer.publicKey() })) as unknown as Record<string, Call>;
await attempt("aggregator.execute_strategy, no tick", () => writer.buildSwap(wallet, quote));
await attempt("controller.withdraw to the wallet, no tick", () => controller.withdraw!({ caller: wallet, account_id: BigInt(nft.tokenId), withdrawals: [[{ asset: XOXNO.usdc, hub_id: 1 }, 10_000_000n]], to: wallet }));
await attempt("usdc.transfer to the aggregator, no tick", () => writer.buildTransfer(wallet, XOXNO_SWAP.router, 10_000_000n));
if (failures) throw new Error(`${failures} call(s) were not rejected with NoSession`);
