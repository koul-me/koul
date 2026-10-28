/**
 * POST { wallet }: a one-time challenge for the wallet's passkey to sign, valid 5 minutes, and the credential ids the
 * wallet holds so the browser offers the right passkey. The signature goes to /api/competition/register.
 */
import { randomBytes } from "node:crypto";
import { COMP_KEYS } from "@koul/core";
import { walletPasskeys } from "@/lib/passkey-proof";
import { rateLimit } from "@/lib/rate-limit";
import { store } from "@/lib/redis";

export async function POST(request: Request): Promise<Response> {
  const limited = await rateLimit(request, "register");
  if (limited) return limited;
  const body = (await request.json().catch(() => null)) as { wallet?: string } | null;
  const wallet = body?.wallet ?? "";
  if (!/^C[A-Z2-7]{55}$/.test(wallet)) return Response.json({ error: "A smart wallet address is required" }, { status: 400 });
  const redis = store();
  if (!redis) return Response.json({ error: "Registration is not open" }, { status: 503 });
  const passkeys = await walletPasskeys(wallet).catch(() => []);
  if (passkeys.length === 0) return Response.json({ error: "No passkey found on that wallet" }, { status: 400 });
  const challenge = randomBytes(32).toString("base64url");
  await redis.set(COMP_KEYS.challenge(wallet), challenge, { ex: 300 });
  return Response.json({ challenge, credentialIds: passkeys.map((p) => p.credentialId.toString("base64url")) });
}
