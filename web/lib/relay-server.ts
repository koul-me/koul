import "server-only";
import { createHash } from "node:crypto";
import { Address, BASE_FEE, Keypair, Operation, TransactionBuilder, rpc, xdr } from "@stellar/stellar-sdk";
import { KOUL, SWAP_TOKENS, XOXNO } from "@/lib/koul";
import { store } from "@/lib/redis";

/**
 * Koul's fee relayer, in front of SDF's. On 2026-10-25 SDF's relayer moved to stellar-accounts v0.8.0 and stopped
 * sponsoring deploys of the account build every Koul wallet uses (`ACCOUNT_WASM`), answering 403 "Deploy WASM hash is
 * not allowlisted", so no wallet could be created. Those deploys are submitted here, with the keeper account as source
 * and fee payer; every other request (passkey-signed calls) goes to SDF's relayer first. SDF also sponsors calls only
 * into contracts it allowlists, and the router deployed the same day is not one ("Wallet contract is not allowlisted"),
 * so a call SDF refuses that way is submitted here too, when it goes to one of Koul's own contracts.
 */
export const ACCOUNT_WASM = "1b5f4534a76322da2ad7c745f6900857a6802b0ca79850c35a03561df997785a";
export const SDF_RELAYER = "https://smart-account-relayer-proxy.sdf-ecosystem.workers.dev";

/** A host function that deploys Koul's account build, and nothing else. */
export function isAccountDeploy(func: xdr.HostFunction): boolean {
  const kind = func.switch().name;
  if (kind !== "hostFunctionTypeCreateContractV2" && kind !== "hostFunctionTypeCreateContract") return false;
  const executable = kind === "hostFunctionTypeCreateContractV2" ? func.createContractV2().executable() : func.createContract().executable();
  return executable.switch().name === "contractExecutableWasm" && executable.wasmHash().toString("hex") === ACCOUNT_WASM;
}

/** The contracts Koul's flows call, the only ones this relay pays for when SDF will not. */
const KOUL_TARGETS = new Set<string>([KOUL.router, KOUL.policy, KOUL.aggregator, XOXNO.controller, XOXNO.usdc, ...SWAP_TOKENS.map((t) => t.id)]);

/** Contracts known to run Koul's account build (a person's wallet); a wallet's code never changes, so this only grows. */
const walletContracts = new Set<string>();

/** True when the contract runs Koul's account build: a call into a person's own wallet, such as granting access. */
async function isKoulWallet(contract: string): Promise<boolean> {
  if (walletContracts.has(contract)) return true;
  try {
    const key = xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({ contract: new Address(contract).toScAddress(), key: xdr.ScVal.scvLedgerKeyContractInstance(), durability: xdr.ContractDataDurability.persistent() }));
    const entry = (await new rpc.Server(KOUL.rpcUrl).getLedgerEntries(key)).entries[0];
    const exec = entry?.val.contractData().val().instance().executable();
    const ours = !!exec && exec.switch().name === "contractExecutableWasm" && exec.wasmHash().toString("hex") === ACCOUNT_WASM;
    if (ours) walletContracts.add(contract);
    return ours;
  } catch {
    return false;
  }
}

/**
 * A host function that calls one of Koul's own contracts or a Koul wallet. SDF's relayer answered 500 to some wallet
 * calls during the 2026-10-28 load test, so every step of Koul's flows is paid here.
 */
export async function isKoulCall(func: xdr.HostFunction): Promise<boolean> {
  if (func.switch().name !== "hostFunctionTypeInvokeContract") return false;
  const target = Address.fromScAddress(func.invokeContract().contractAddress()).toString();
  return KOUL_TARGETS.has(target) || (await isKoulWallet(target));
}

/**
 * Channel accounts. The network keeps one pending Soroban transaction per source account, so with the keeper account
 * as the only payer every relayed deploy or call waited for the one before it, and five wallets created at once got
 * TRY_AGAIN_LATER (load test, 2026-10-28). The relay now pays from a pool of channel accounts, each its own source,
 * derived from the keeper secret (no new secrets) and funded by `pnpm channels` in keeper/. A Redis lock keeps two
 * requests off the same channel; without Redis, or with no funded channel, it falls back to the keeper account.
 */
export const RELAY_CHANNELS = Number(process.env.RELAY_CHANNELS ?? 8);
export const channelKeypair = (keeperSecret: string, i: number) => Keypair.fromRawEd25519Seed(createHash("sha256").update(`koul-relay-channel:${i}:${keeperSecret}`).digest());
/** A channel stays locked a little over two ledgers: long enough for its transaction to leave the pending queue. */
const LOCK_SECONDS = 12;
const WAIT_MS = 12_000;

async function lockChannel(secret: string, skip: Set<number>): Promise<{ keypair: Keypair; index: number } | null> {
  const redis = store();
  if (!redis || RELAY_CHANNELS <= 0) return null;
  const end = Date.now() + WAIT_MS;
  while (Date.now() < end) {
    const order = Array.from({ length: RELAY_CHANNELS }, (_, i) => i).filter((i) => !skip.has(i)).sort(() => Math.random() - 0.5);
    if (order.length === 0) return null;
    for (const i of order) {
      if ((await redis.set(`koul:relay:channel:${i}`, Date.now(), { nx: true, ex: LOCK_SECONDS })) === "OK") return { keypair: channelKeypair(secret, i), index: i };
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return null;
}

/**
 * Submit the host function with the signed authorization the browser built, and return the hash of the transaction
 * that landed. Paid by a free channel account; a busy or unfunded channel is skipped for another. The relay waits for
 * the result: when wallets act at the same moment, a transaction simulated against state that changed before it
 * applied fails on-chain (XOXNO hands out account numbers in order, so two openings race; a shared entry grows past
 * its simulated size). That failure leaves the signed authorization unused, so the relay simulates again against fresh
 * state and resubmits, up to three tries, instead of failing the person's step (load test, 2026-10-28).
 */
export async function submitSponsored(func: xdr.HostFunction, auth: xdr.SorobanAuthorizationEntry[], secret: string): Promise<string> {
  const server = new rpc.Server(KOUL.rpcUrl);
  const skip = new Set<number>();
  let lastCode = "no channel";
  let onChainFailures = 0;
  for (let attempt = 0; attempt < 8; attempt++) {
    const channel = await lockChannel(secret, skip);
    const source = channel?.keypair ?? Keypair.fromSecret(secret);
    let account;
    try { account = await server.getAccount(source.publicKey()); } catch {
      // A channel that was never funded: leave it out and try the next.
      if (channel) { skip.add(channel.index); continue; }
      throw new Error("The relay account is missing");
    }
    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: KOUL.networkPassphrase })
      .addOperation(Operation.invokeHostFunction({ func, auth })).setTimeout(60).build();
    const prepared = await server.prepareTransaction(tx);
    prepared.sign(source);
    const sent = await server.sendTransaction(prepared);
    if (sent.status === "PENDING" || sent.status === "DUPLICATE") {
      const done = await server.pollTransaction(sent.hash, { attempts: 10, sleepStrategy: () => 1500 });
      if (done.status !== "FAILED") return sent.hash; // landed, or still pending: the kit keeps polling it
      lastCode = "failed on-chain";
      onChainFailures++;
      if (onChainFailures >= 3) break;
      continue;
    }
    lastCode = sent.errorResult?.result().switch().name ?? sent.status;
    const retry = lastCode === "txBadSeq" || sent.status === "TRY_AGAIN_LATER" || lastCode === "txInsufficientBalance";
    if (!retry) break;
    if (channel && lastCode === "txInsufficientBalance") skip.add(channel.index);
    if (!channel) await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error(`The transaction was rejected: ${lastCode}`);
}
