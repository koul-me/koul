import "server-only";

/** Mail through Resend's REST API, from hello@koul.me. Without RESEND_API_KEY nothing is sent. */
const FROM = process.env.WAITLIST_FROM ?? "Koul <hello@koul.me>";

/** True when Resend took the email. */
export async function sendMail(to: string, subject: string, text: string, html: string): Promise<boolean> {
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
    console.error(JSON.stringify({ level: "error", mail: subject, message }));
    return false;
  }
}
