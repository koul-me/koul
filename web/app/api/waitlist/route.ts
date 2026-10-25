import { after } from "next/server";
import { z } from "zod";
import { notifyOwner, sendWelcome } from "@/lib/waitlist-mail";
import { joinWaitlist } from "@/lib/waitlist-server";

const Body = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  from: z.string().max(32).optional(),
  /** A field people never see; a bot that fills it gets the same answer and nothing is stored. */
  company: z.string().optional(),
});

/** Body: { email, from? }. The same answer whether the email is new or already on the list; only a new one gets mail. */
export async function POST(request: Request): Promise<Response> {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  const { email, from = "unknown", company } = parsed.data;
  if (company) return Response.json({ ok: true });
  try {
    const joined = await joinWaitlist(email, from);
    if (!joined) return Response.json({ error: "Something went wrong. Try again in a minute." }, { status: 503 });
    // Only a new signup sends mail, after the answer has gone back, so an address gets one confirmation at most.
    if (joined.result === "added") after(() => Promise.all([sendWelcome(email), notifyOwner(email, from, joined.count)]));
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Waitlist failed";
    console.error(JSON.stringify({ level: "error", route: "/api/waitlist", message }));
    return Response.json({ error: "Something went wrong. Try again in a minute." }, { status: 502 });
  }
}
