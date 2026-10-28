import "server-only";
import { createHash, webcrypto } from "node:crypto";
import { BASE_FEE, Contract, TransactionBuilder, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import { KOUL, SIM_SOURCE } from "@/lib/koul";

/**
 * Proof that a person controls a smart wallet: a passkey signature over a one-time challenge, checked against the
 * passkey public key the wallet itself stores on chain (a WebAuthn signer: the verifier contract plus 65 bytes of
 * public key and the credential id). Nothing the browser says about the wallet is trusted.
 */
const WEBAUTHN_VERIFIER = process.env.KOUL_WEBAUTHN_VERIFIER ?? "CC7EKIHQP3TN4CARQDND6CEOY2UXLWWC2X5GHTD5NLAT7BG5GPZIOM3F";

export interface WalletPasskey { publicKey: Buffer; credentialId: Buffer }

async function simulate(wallet: string, method: string, ...args: xdr.ScVal[]): Promise<unknown> {
  const server = new rpc.Server(KOUL.rpcUrl);
  const tx = new TransactionBuilder(await server.getAccount(SIM_SOURCE), { fee: BASE_FEE, networkPassphrase: KOUL.networkPassphrase })
    .addOperation(new Contract(wallet).call(method, ...args)).setTimeout(30).build();
  const sim = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim)) return null;
  return scValToNative(sim.result!.retval);
}

/** Every passkey signer across the wallet's context rules. */
export async function walletPasskeys(wallet: string): Promise<WalletPasskey[]> {
  const count = Number((await simulate(wallet, "get_context_rules_count")) ?? 0);
  const out: WalletPasskey[] = [];
  for (let id = 0; id < Math.min(count, 32); id++) {
    const rule = (await simulate(wallet, "get_context_rule", xdr.ScVal.scvU32(id))) as { signers?: unknown[] } | null;
    for (const s of rule?.signers ?? []) {
      if (!Array.isArray(s) || s[0] !== "External" || s[1] !== WEBAUTHN_VERIFIER || !Buffer.isBuffer(s[2]) || s[2].length <= 65) continue;
      out.push({ publicKey: s[2].subarray(0, 65), credentialId: s[2].subarray(65) });
    }
  }
  return out;
}

export interface Assertion { credentialId: string; authenticatorData: string; clientDataJSON: string; signature: string }

const b64url = (s: string) => Buffer.from(s, "base64url");
const sha256 = (b: Buffer | string) => createHash("sha256").update(b).digest();

/** WebAuthn signs ECDSA as DER; WebCrypto verifies the raw 64-byte r||s form. */
export function derToRaw(der: Buffer): Buffer {
  if (der[0] !== 0x30) throw new Error("signature is not DER");
  let i = 2;
  const read = () => {
    if (der[i] !== 0x02) throw new Error("signature is not DER");
    const len = der[i + 1]!;
    let n = der.subarray(i + 2, i + 2 + len);
    i += 2 + len;
    while (n.length > 32 && n[0] === 0) n = n.subarray(1);
    return Buffer.concat([Buffer.alloc(32 - n.length), n]);
  };
  return Buffer.concat([read(), read()]);
}

/** The relying party a browser at `origin` signs for: koul.me on every koul.me host (see app/providers.tsx). */
export function rpIdFor(origin: string): string | null {
  let host: string;
  try { host = new URL(origin).hostname; } catch { return null; }
  if (host === "koul.me" || host.endsWith(".koul.me")) return "koul.me";
  // Local development only; production accepts koul.me alone.
  if (process.env.NODE_ENV !== "production" && (host === "localhost" || host.endsWith(".localhost"))) return host;
  return null;
}

/**
 * Checks one assertion against the wallet's passkeys. Returns null when it holds, otherwise why not. The challenge
 * must be the one this server issued, the origin a Koul origin, the user present, and the signature valid.
 */
export async function verifyAssertion(passkeys: WalletPasskey[], a: Assertion, challenge: string): Promise<string | null> {
  const key = passkeys.find((p) => p.credentialId.equals(b64url(a.credentialId)));
  if (!key) return "That passkey does not belong to this wallet";
  let client: { type?: string; challenge?: string; origin?: string };
  try { client = JSON.parse(b64url(a.clientDataJSON).toString("utf8")); } catch { return "The passkey answer is malformed"; }
  if (client.type !== "webauthn.get") return "The passkey answer is not a sign-in";
  if (client.challenge !== challenge) return "The challenge does not match; ask for a new one";
  const rpId = client.origin ? rpIdFor(client.origin) : null;
  if (!rpId) return "The passkey answer comes from another site";
  const auth = b64url(a.authenticatorData);
  if (auth.length < 37 || !auth.subarray(0, 32).equals(sha256(rpId))) return "The passkey belongs to another site";
  if ((auth[32]! & 0x01) === 0) return "The passkey was not confirmed by the person";
  const signed = Buffer.concat([auth, sha256(b64url(a.clientDataJSON))]);
  const pub = await webcrypto.subtle.importKey("raw", key.publicKey, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  let raw: Buffer;
  try { raw = derToRaw(b64url(a.signature)); } catch { return "The passkey signature is malformed"; }
  const ok = await webcrypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, raw, signed);
  return ok ? null : "The passkey signature does not verify";
}
