import "server-only";
import { approveSignature } from "@/lib/invite";

/**
 * The waitlist emails, through Resend's REST API: a confirmation to whoever joined, a notice to the owner
 * (WAITLIST_NOTIFY_TO) with an Approve link, and the invite once approved. Both are skipped without RESEND_API_KEY. A failed send is logged, never thrown, so it can
 * never fail a signup.
 */
const FROM = process.env.WAITLIST_FROM ?? "Koul <hello@koul.me>";
/** Where links in the emails point; the Approve link never trusts a request's own host. */
const SITE = process.env.WAITLIST_BASE_URL ?? "https://koul.me";
const APP = process.env.WAITLIST_APP_URL ?? "https://app.koul.me";

/** True when Resend took the email. */
async function send(to: string, subject: string, text: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from: FROM, to, subject, text, html }),
    });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "send failed";
    console.error(JSON.stringify({ level: "error", route: "/api/waitlist", mail: subject, message }));
    return false;
  }
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export async function sendWelcome(email: string) {
  return send(
    email,
    "You're on the Koul waitlist",
    "Thanks for joining. Koul opens in batches, and we'll email you when it's your turn.\n\nKoul\nhttps://koul.me",
    `<p>Thanks for joining. Koul opens in batches, and we'll email you when it's your turn.</p><p>Koul<br><a href="https://koul.me">koul.me</a></p>`,
  );
}

/** The owner's one-click link. Opening it only shows a confirm page; the invite goes out on its button. */
export async function approveLink(email: string): Promise<string | null> {
  const secret = process.env.WAITLIST_SECRET;
  if (!secret) return null;
  const query = new URLSearchParams({ email, sig: await approveSignature(email, secret) });
  return `${SITE}/api/waitlist/approve?${query}`;
}

export async function notifyOwner(email: string, from: string, count: number) {
  const to = process.env.WAITLIST_NOTIFY_TO;
  if (!to) return false;
  const line = `${email} joined the waitlist from ${from}. ${count} on the list.`;
  const link = await approveLink(email);
  return send(
    to,
    `Waitlist: ${email}`,
    link ? `${line}\n\nApprove and send an invite: ${link}` : line,
    `<p>${escape(line)}</p>${link ? `<p><a href="${escape(link)}">Approve and send an invite</a></p>` : ""}`,
  );
}

export async function sendInvite(email: string, code: string) {
  const link = `${APP}/?invite=${code}`;
  return send(
    email,
    "You're in: your Koul invite",
    `You're off the waitlist. Open Koul here:\n${link}\n\nOn another device, enter this code under "Have a code?" on koul.me:\n${code}\n\nKoul\nhttps://koul.me`,
    `<p>You're off the waitlist.</p><p><a href="${escape(link)}">Open Koul</a></p><p>On another device, enter this code under "Have a code?" on koul.me:<br><strong style="font-family:monospace;font-size:18px">${escape(code)}</strong></p><p>Koul<br><a href="https://koul.me">koul.me</a></p>`,
  );
}
