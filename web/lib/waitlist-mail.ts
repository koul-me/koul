import "server-only";

/**
 * The two waitlist emails, through Resend's REST API: a confirmation to whoever joined, and a notice to the owner
 * (WAITLIST_NOTIFY_TO). Both are skipped without RESEND_API_KEY. A failed send is logged, never thrown, so it can
 * never fail a signup.
 */
const FROM = process.env.WAITLIST_FROM ?? "Koul <hello@koul.me>";

async function send(to: string, subject: string, text: string, html: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from: FROM, to, subject, text, html }),
    });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "send failed";
    console.error(JSON.stringify({ level: "error", route: "/api/waitlist", mail: subject, message }));
  }
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export async function sendWelcome(email: string) {
  await send(
    email,
    "You're on the Koul waitlist",
    "Thanks for joining. Koul opens in batches, and we'll email you when it's your turn.\n\nKoul\nhttps://koul.me",
    `<p>Thanks for joining. Koul opens in batches, and we'll email you when it's your turn.</p><p>Koul<br><a href="https://koul.me">koul.me</a></p>`,
  );
}

export async function notifyOwner(email: string, from: string, count: number) {
  const to = process.env.WAITLIST_NOTIFY_TO;
  if (!to) return;
  const line = `${email} joined the waitlist from ${from}. ${count} on the list.`;
  await send(to, `Waitlist: ${email}`, line, `<p>${escape(line)}</p>`);
}
