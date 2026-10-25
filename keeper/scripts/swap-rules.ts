/**
 * Live setup for swap rules on the swap wallet (`pnpm swap` creates it), every write signed by its passkey:
 *   1. an XOXNO position on hub 1 if the wallet has none (2 USDC), so a rule can withdraw and swap;
 *   2. the agent rule under koul_agent_policy, with the permissions the autopilot needs (aggregator included);
 *   3. router.set_autopilot(wallet, 1, ...): sell 20 XLM for USDC while the wallet holds 100 XLM or more, then
 *      withdraw 1 USDC from hub 1 and swap it into XLM.
 * Then it prints what the next tick would do. Run the keeper against the same router to fire the rules.
 * ROUTER_V1 and KOUL_POLICY choose the deployment (a staging router works); the agent key is AGENT_SECRET, or a test
 * key kept in the swap state when that is not set.
 *   ROUTER_V1=C... KOUL_POLICY=C... pnpm swap-rules
 */
import { Keypair } from "@stellar/stellar-sdk";
import { KoulReader, KoulWriter, XOXNO_POSITION_NFT, XOXNO_SWAP, type Autopilot } from "@koul/core";
import { SoftwareAuthenticator, type AuthenticatorState } from "../src/phase0/passkey";
import { ORIGIN, RP_ID, TESTNET, XOXNO, json, loadEnv, loadState, makeKit, saveState, step } from "../src/lib/common";

interface SwapState { contractId: string; passkey: AuthenticatorState; deployerSecret: string; agentSecret?: string }
const env = loadEnv();
const state = loadState();
const saved = state.swap as SwapState | undefined;
if (!saved) throw new Error("no swap wallet yet: run pnpm swap first");
const ROUTER = env.ROUTER_V1!;
const POLICY = env.KOUL_POLICY!;
if (!ROUTER || !POLICY) throw new Error("ROUTER_V1 and KOUL_POLICY are required");
const wallet = saved.contractId;
const deployer = Keypair.fromSecret(saved.deployerSecret);
if (!env.AGENT_SECRET && !saved.agentSecret) saved.agentSecret = Keypair.random().secret();
const agent = Keypair.fromSecret(env.AGENT_SECRET ?? saved.agentSecret!);
const authenticator = new SoftwareAuthenticator(RP_ID, ORIGIN, saved.passkey);
const kit = makeKit({ ...env, KEEPER_SECRET: deployer.secret() }, authenticator);
await kit.connectWallet({ credentialId: saved.passkey.credentialId, contractId: wallet });
const save = () => { state.swap = { ...saved, passkey: authenticator.toState() }; saveState(state); };
save();
const base = { rpcUrl: TESTNET.rpcUrl, networkPassphrase: TESTNET.networkPassphrase, publicKey: deployer.publicKey(), router: ROUTER, oracle: env.MOCK_FX ?? "", controller: XOXNO.controller, pool: XOXNO.pool, usdc: XOXNO.usdc, xlm: TESTNET.xlmSac, positionNft: XOXNO_POSITION_NFT };
const reader = new KoulReader(base);
const writer = new KoulWriter({ ...base, policy: POLICY, ed25519Verifier: TESTNET.ed25519VerifierAddress, spoke: XOXNO.spoke, aggregator: XOXNO_SWAP.router });
const sign = async (what: string, tx: Parameters<typeof kit.signAndSubmit>[0]) => {
  const res = await kit.signAndSubmit(tx, { forceMethod: "rpc" });
  save();
  if (!res.success) throw new Error(`${what} failed: ${json(res.error).slice(0, 600)}`);
  console.log(`${what}: ${res.hash}`);
};

step("1. XOXNO position");
let nft = await reader.readPositionNft(wallet);
if (!nft) {
  await sign("supply 2 USDC to hub 1, opening the position", await writer.buildSupply(wallet, 0n, 1, 20_000_000n));
  for (let i = 0; i < 10 && !nft; i++) { await new Promise((r) => setTimeout(r, 2000)); nft = await reader.readPositionNft(wallet); }
  if (!nft) throw new Error("position NFT not visible after supply");
}
const accountId = String(nft.tokenId);
console.log(`XOXNO account ${accountId}`);

const autopilot: Autopilot = { account_id: accountId, rules: [
  { conditions: [{ type: "TokenBalance", token: TESTNET.xlmSac, cmp: "AtOrAbove", amount: "1000000000" }], match_all: true,
    action: { type: "SwapFromWallet", token_in: TESTNET.xlmSac, token_out: XOXNO.usdc, amount: { type: "Fixed", value: "200000000" }, max_slippage_bps: 300 }, cooldown_ledgers: 60 },
  { conditions: [{ type: "TokenPrice", token: TESTNET.xlmSac, cmp: "AtOrAbove", level: "1000000000000" }], match_all: true,
    action: { type: "WithdrawAndSwap", hub: 1, token_out: TESTNET.xlmSac, amount: { type: "Fixed", value: "10000000" }, max_slippage_bps: 300 }, cooldown_ledgers: 60 },
] };

step(`2. agent ${agent.publicKey().slice(0, 8)} under policy ${POLICY.slice(0, 8)}`);
const name = `koul-agent-${ROUTER.slice(1, 7).toLowerCase()}`;
let rules = await kit.rules.list();
let mine = rules.find((r) => r.name === name && r.policies.includes(POLICY));
if (!mine) {
  await sign("grant", await writer.buildGrantAgent(kit, autopilot, agent.rawPublicKey(), 1, name));
  for (let i = 0; i < 10 && !mine; i++) { await new Promise((r) => setTimeout(r, 2000)); rules = await kit.rules.list(); mine = rules.find((r) => r.name === name && r.policies.includes(POLICY)); }
  if (!mine) throw new Error("agent rule not visible after grant");
}
for (const old of rules.filter((r) => r.name.startsWith("koul-agent") && r.id !== mine!.id)) await sign(`remove stale rule ${old.id} ${old.name}`, await kit.rules.remove(Number(old.id)));
console.log(`agent rule ${mine.id}`);

step("3. autopilot 1");
await sign("set_autopilot", await writer.buildSetAutopilot(wallet, 1, autopilot));
console.log(`next action: ${json(await reader.nextAction(wallet, 1))}`);
console.log(`check: ${json(await reader.checkAutopilot(wallet, 1))}`);
console.log(`\nfire it: ROUTER_V1=${ROUTER} AGENT_SECRET=<agent> KEEPER_SECRET=<fee payer> pnpm keeper:once`);
