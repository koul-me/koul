/**
 * POST { wallet, handle, email, acceptedTerms: true, assertion }: enter the competition. The assertion is the wallet's
 * passkey signing the challenge from /api/competition/challenge, so only the person who controls a wallet can enter it,
 * and that signature confirms the entry: it is scored from the indexer's next run. One entry per wallet, per handle and
 * per email. The entrant must accept the terms (koul.me/compete/terms), and entries close once `maxEntrants` is
 * reached. The email is how winners can be reached; the "You're in" note to it goes out after the answer, best effort,
 * because the mail plan has a small daily quota.
 */
import { after } from "next/server";
import { z } from "zod";
import { COMP_KEYS, HANDLE_PATTERN, RESERVED_HANDLES, type CompetitionConfig, type EntrantRecord } from "@koul/core";
import { confirmEntry, sendEntryNote } from "@/lib/competition-server";
import { maxEntrantsOf } from "@/lib/competition-view";
import { verifyAssertion, walletPasskeys } from "@/lib/passkey-proof";
import { rateLimit } from "@/lib/rate-limit";
import { store } from "@/lib/redis";

const TERMS_MESSAGE = "Accept the competition terms to enter";

const Body = z.object({
  wallet: z.string().regex(/^C[A-Z2-7]{55}$/),
  handle: z.string().regex(HANDLE_PATTERN, "A handle is 3 to 20 letters, digits or underscores"),
  email: z.string().trim().toLowerCase().email().max(254),
  acceptedTerms: z.boolean({ message: TERMS_MESSAGE }).refine((v) => v, TERMS_MESSAGE),
  /** The handle in the invite link this person came through (koul.me/compete?ref=handle); optional. */
  ref: z.string().regex(HANDLE_PATTERN).optional(),
  assertion: z.object({ credentialId: z.string(), authenticatorData: z.string(), clientDataJSON: z.string(), signature: z.string() }),
});

export async function POST(request: Request): Promise<Response> {
  const limited = await rateLimit(request, "register");
  if (limited) return limited;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Check the form" }, { status: 400 });
  const { wallet, handle, email, assertion, ref } = parsed.data;
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

  const entered = await confirmEntry(redis, { wallet, handle, email, max, now: Date.now() });
  if (!entered.ok) return Response.json({ error: entered.error }, { status: 409 });
  // An invite counts once, for a confirmed entrant other than yourself, and never twice for one wallet.
  if (ref && ref.toLowerCase() !== handle.toLowerCase()) {
    const inviter = await redis.get<string>(COMP_KEYS.handle(ref));
    const inviterRecord = inviter && inviter !== wallet ? await redis.get<EntrantRecord>(COMP_KEYS.entrant(inviter)) : null;
    if (inviterRecord?.verifiedAt && !entered.record.referredBy) {
      await Promise.all([redis.set(COMP_KEYS.entrant(wallet), { ...entered.record, referredBy: inviterRecord.handle }), redis.incr(COMP_KEYS.referrals(inviterRecord.handle))]);
    }
  }
  after(() => sendEntryNote(email, handle, config.name));
  return Response.json({ ok: true, handle });
}
