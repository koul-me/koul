/**
 * The owner's Approve link from the signup notice. GET only shows a confirm page, because mail scanners open every
 * link in an email; the button POSTs back here, which makes the person's personal code and emails their invite.
 * The link is signed for one email with WAITLIST_SECRET.
 */
import { approveSignature, sameString } from "@/lib/invite";
import { sendInvite } from "@/lib/waitlist-mail";
import { approve } from "@/lib/waitlist-server";

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escape(title)} · Koul</title>
<style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#000;color:#fff;font:17px/1.5 system-ui,sans-serif;padding:16px}main{max-width:420px;width:100%}h1{font-size:32px;line-height:1.1;margin:0 0 12px}p{color:#a3a3a3;margin:0 0 24px}b{color:#fff}button{height:56px;padding:0 28px;border:0;border-radius:999px;background:#c8f03c;color:#0a0a0a;font:700 17px system-ui,sans-serif;cursor:pointer}</style>
</head><body><main><h1>${escape(title)}</h1>${body}</main></body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

/** The email from a link whose signature holds, or null. */
async function signedEmail(url: URL): Promise<string | null> {
  const secret = process.env.WAITLIST_SECRET;
  const email = url.searchParams.get("email")?.trim().toLowerCase();
  const sig = url.searchParams.get("sig");
  if (!secret || !email || !sig) return null;
  return sameString(sig, await approveSignature(email, secret)) ? email : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const email = await signedEmail(url);
  if (!email) return page("Link not valid", "<p>This approve link is broken or was changed.</p>", 403);
  return page(
    "Approve this signup?",
    `<p><b>${escape(email)}</b> gets an email with their invite link and code.</p><form method="post" action="${escape(url.pathname + url.search)}"><button type="submit">Send invite</button></form>`,
  );
}

export async function POST(request: Request) {
  const email = await signedEmail(new URL(request.url));
  if (!email) return page("Link not valid", "<p>This approve link is broken or was changed.</p>", 403);
  try {
    const approved = await approve(email);
    if (!approved) return page("Not set up", "<p>The waitlist store is not configured.</p>", 503);
    const sent = await sendInvite(email, approved.code);
    const again = approved.fresh ? "" : " They were approved before, so this is the same code again.";
    return sent
      ? page("Invite sent", `<p><b>${escape(email)}</b> can open Koul with code <b>${escape(approved.code)}</b>.${again}</p>`)
      : page("Approved, email failed", `<p><b>${escape(email)}</b> is approved with code <b>${escape(approved.code)}</b>, but the email did not go out. Send them the code yourself.</p>`, 502);
  } catch (error) {
    const message = error instanceof Error ? error.message : "approve failed";
    console.error(JSON.stringify({ level: "error", route: "/api/waitlist/approve", message }));
    return page("Something went wrong", "<p>Try the link again in a minute.</p>", 502);
  }
}
