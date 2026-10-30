/**
 * POST { wallet, handle, email, acceptedTerms: true, assertion }: enter the competition. The assertion is the wallet's
 * passkey signing the challenge from /api/competition/challenge, so only the person who controls a wallet can enter it.
 * The entry counts once the email link is opened (/api/competition/verify). One entry per wallet, per handle and per email. The
 * entrant must accept the terms (koul.me/compete/terms), and entries close once a set `maxEntrants` is confirmed.
 */
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { COMP_KEYS, HANDLE_PATTERN, RESERVED_HANDLES, type CompetitionConfig, type EntrantRecord } from "@koul/core";
import { maxEntrantsOf } from "@/lib/competition-view";
import { sendMail } from "@/lib/mail";
import { verifyAssertion, walletPasskeys } from "@/lib/passkey-proof";
import { rateLimit } from "@/lib/rate-limit";
import { store } from "@/lib/redis";

const TERMS_MESSAGE = "Accept the competition terms to enter";

const Body = z.object({
  wallet: z.string().regex(/^C[A-Z2-7]{55}$/),
  handle: z.string().regex(HANDLE_PATTERN, "A handle is 3 to 20 letters, digits or underscores"),
  email: z.string().trim().toLowerCase().email().max(254),
  acceptedTerms: z.boolean({ message: TERMS_MESSAGE }).refine((v) => v, TERMS_MESSAGE),
  assertion: z.object({ credentialId: z.string(), authenticatorData: z.string(), clientDataJSON: z.string(), signature: z.string() }),
});

const SITE = process.env.COMPETITION_BASE_URL ?? "https://koul.me";
const emailKey = (email: string) => `koul:comp:email:${createHash("sha256").update(email).digest("hex")}`;

export async function POST(request: Request): Promise<Response> {
  const limited = await rateLimit(request, "register");
  if (limited) return limited;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Check the form" }, { status: 400 });
  const { wallet, handle, email, assertion } = parsed.data;
  if (RESERVED_HANDLES.has(handle.toLowerCase())) return Response.json({ error: "That handle is taken" }, { status: 409 });
  const redis = store();
  if (!redis) return Response.json({ error: "Registration is not open" }, { status: 503 });

  const config = await redis.get<CompetitionConfig>(COMP_KEYS.config);
  if (!config) return Response.json({ error: "There is no competition open right now" }, { status: 409 });
  const max = maxEntrantsOf(config);
  if (max !== null && (await redis.scard(COMP_KEYS.entrants)) >= max) return Response.json({ error: `Entries are full: all ${max} places are taken.` }, { status: 409 });

  // The challenge works once.
  const challenge = await redis.getdel<string>(COMP_KEYS.challenge(wallet));
  if (!challenge) return Response.json({ error: "The challenge expired; try again" }, { status: 400 });
  const problem = await verifyAssertion(await walletPasskeys(wallet), assertion, challenge);
  if (problem) return Response.json({ error: problem }, { status: 403 });

  const existing = await redis.get<EntrantRecord>(COMP_KEYS.entrant(wallet));
  if (existing?.verifiedAt) return Response.json({ error: `This wallet is already entered as ${existing.handle}` }, { status: 409 });
  // Claims that are not the same pending entry are refused; a pending entry of this wallet can be redone.
  const handleOwner = await redis.get<string>(COMP_KEYS.handle(handle));
  if (handleOwner && handleOwner !== wallet) return Response.json({ error: "That handle is taken" }, { status: 409 });
  const emailOwner = await redis.get<string>(emailKey(email));
  if (emailOwner && emailOwner !== wallet) return Response.json({ error: "That email already has an entry" }, { status: 409 });

  const now = Date.now();
  const record: EntrantRecord = { wallet, handle, email, registeredAt: now, verifiedAt: null, acceptedTermsAt: now };
  const token = randomBytes(24).toString("base64url");
  if (existing && existing.handle.toLowerCase() !== handle.toLowerCase()) await redis.del(COMP_KEYS.handle(existing.handle));
  await Promise.all([
    redis.set(COMP_KEYS.entrant(wallet), record),
    redis.set(COMP_KEYS.handle(handle), wallet),
    redis.set(emailKey(email), wallet),
    redis.set(COMP_KEYS.pending(token), wallet, { ex: 7 * 86400 }),
  ]);
  const link = `${SITE}/api/competition/verify?token=${token}`;
  const sent = await sendMail(email, `Confirm your entry: ${config.name}`, `Open this link to confirm your Koul entry as ${handle}:\n${link}\n\nIf you did not enter, ignore this email.`, `<p>Open this link to confirm your Koul entry as <b>${handle}</b>:</p><p><a href="${link}">Confirm my entry</a></p><p>If you did not enter, ignore this email.</p>`);
  return Response.json({ ok: true, handle, emailSent: sent });
}
