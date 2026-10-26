"use client";

/**
 * The waitlist's email field and button, one row at the height of the Open app pill it replaces, and "Have a code?"
 * to swap it for an invite code row. The result takes the same row and errors share the fixed line under it, so
 * nothing on the page moves.
 */
import * as React from "react";
import { Check } from "lucide-react";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { WAITLIST_GATED } from "@/lib/waitlist";

const TONES = {
  dark: { input: "bg-surface text-text placeholder:text-muted", button: "bg-lime text-on-lime hover:brightness-95", error: "text-danger" },
  onLime: { input: "bg-on-lime/10 text-on-lime placeholder:text-on-lime/60", button: "bg-on-lime text-lime hover:opacity-90", error: "text-on-lime" },
} as const;

const ring = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text";

/** Scrolls to the first waitlist field on the page and puts the cursor in it. */
export function focusWaitlist() {
  const input = document.querySelector<HTMLInputElement>("[data-waitlist-input]");
  if (!input) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  input.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  input.focus({ preventScroll: true });
}

type Mode = "email" | "code";

/**
 * `codeTarget` is the page a code opens: "/app" from the landing (the proxy sends it on to app.koul.me), or by
 * default the page in the address bar, so a deep link like /autopilot?load= survives the invite.
 */
export function WaitlistForm({ tone = "dark", from, className, codeTarget, initialMode = "email", initialError = null }: {
  tone?: "dark" | "onLime";
  from: string;
  className?: string;
  codeTarget?: string;
  initialMode?: Mode;
  initialError?: string | null;
}) {
  const t = TONES[tone];
  const [mode, setMode] = React.useState<Mode>(initialMode);
  const [state, setState] = React.useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = React.useState<string | null>(initialError);
  const errorId = `waitlist-${from}-error`;

  async function join(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setState("sending");
    setError(null);
    try {
      const r = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: data.get("email"), company: data.get("company"), from }),
      });
      const body = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(body.error ?? "Something went wrong. Try again in a minute.");
      track("waitlist_joined", { from });
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again in a minute.");
      setState("idle");
    }
  }

  /** The proxy checks the code: a good one opens the app, a wrong one comes back to the waitlist saying so. */
  function submitCode(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") ?? "").trim();
    if (!code) return;
    setState("sending");
    const url = new URL(codeTarget ?? window.location.href, window.location.href);
    url.searchParams.delete("invalid");
    url.searchParams.set("invite", code);
    track("open_app", { from: `${from}_code` });
    window.location.assign(url.toString());
  }

  function switchTo(next: Mode) {
    setMode(next);
    setError(null);
    setState((s) => (s === "sending" ? "idle" : s));
  }

  const field = cn("h-14 min-w-0 flex-1 rounded-full px-5 text-[17px]", ring, t.input);
  const button = cn("inline-flex h-14 shrink-0 items-center justify-center rounded-full px-6 text-[17px] font-bold whitespace-nowrap transition-[filter,opacity] disabled:opacity-70", ring, t.button);
  const described = error ? errorId : undefined;
  const hint = cn("shrink-0 underline underline-offset-4 opacity-80 transition-opacity hover:opacity-100", ring);

  return (
    <div className={className}>
      {mode === "email" && state === "done" ? (
        <p role="status" className="flex h-14 items-center gap-2 text-[17px] font-bold">
          <Check className="size-5" aria-hidden />
          You&apos;re on the list.
        </p>
      ) : mode === "email" ? (
        <form onSubmit={join} className="relative flex gap-2">
          <label htmlFor={`waitlist-${from}`} className="sr-only">Email</label>
          <input id={`waitlist-${from}`} data-waitlist-input name="email" type="email" required autoComplete="email" placeholder="Your email" aria-invalid={error ? true : undefined} aria-describedby={described} className={field} />
          {/* Off screen and out of the tab order: only a bot fills it. */}
          <input name="company" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] size-px opacity-0" />
          <button type="submit" disabled={state === "sending"} className={button}>Join waitlist</button>
        </form>
      ) : (
        <form onSubmit={submitCode} className="flex gap-2">
          <label htmlFor={`invite-${from}`} className="sr-only">Invite code</label>
          <input id={`invite-${from}`} name="code" required autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="Invite code" aria-invalid={error ? true : undefined} aria-describedby={described} autoFocus className={field} />
          <button type="submit" disabled={state === "sending"} className={button}>Open app</button>
        </form>
      )}
      {/* One line under the row, always there, so switching or an error never moves the page. */}
      <p className="mt-3 flex h-5 items-center gap-x-4 px-5 text-[14px] whitespace-nowrap">
        {WAITLIST_GATED ? (
          <button type="button" onClick={() => switchTo(mode === "email" ? "code" : "email")} className={hint}>
            {mode === "email" ? "Have a code?" : "Join waitlist"}
          </button>
        ) : (
          // The app is open while the waitlist collects emails: no code needed.
          <a href={codeTarget ?? "/app"} onClick={() => track("open_app", { from })} className={hint}>Or open the app</a>
        )}
        {error && <span id={errorId} role="alert" title={error} className={cn("min-w-0 truncate", t.error)}>{error}</span>}
      </p>
    </div>
  );
}
