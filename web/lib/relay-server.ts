import "server-only";
import { BASE_FEE, Keypair, Operation, TransactionBuilder, rpc, xdr } from "@stellar/stellar-sdk";
import { KOUL } from "@/lib/koul";

/**
 * Koul's fee relayer, in front of SDF's. On 2026-10-25 SDF's relayer moved to stellar-accounts v0.8.0 and stopped
 * sponsoring deploys of the account build every Koul wallet uses (`ACCOUNT_WASM`), answering 403 "Deploy WASM hash is
 * not allowlisted", so no wallet could be created. Those deploys are submitted here, with the keeper account as source
 * and fee payer; every other request (passkey-signed calls) goes to SDF's relayer unchanged.
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

/**
 * Submit the deploy with the signed authorization the browser built, and return its hash; the kit polls for the
 * result. One retry when the keeper's sequence moved under us (the keeper and the funds routes share the account).
 */
export async function submitAccountDeploy(func: xdr.HostFunction, auth: xdr.SorobanAuthorizationEntry[], secret: string): Promise<string> {
  const server = new rpc.Server(KOUL.rpcUrl);
  const source = Keypair.fromSecret(secret);
  for (let attempt = 0; ; attempt++) {
    const tx = new TransactionBuilder(await server.getAccount(source.publicKey()), { fee: BASE_FEE, networkPassphrase: KOUL.networkPassphrase })
      .addOperation(Operation.invokeHostFunction({ func, auth })).setTimeout(60).build();
    const prepared = await server.prepareTransaction(tx);
    prepared.sign(source);
    const sent = await server.sendTransaction(prepared);
    if (sent.status === "PENDING" || sent.status === "DUPLICATE") return sent.hash;
    const code = sent.errorResult?.result().switch().name ?? sent.status;
    if (attempt === 0 && (code === "txBadSeq" || sent.status === "TRY_AGAIN_LATER")) continue;
    throw new Error(`The deploy was rejected: ${code}`);
  }
}
