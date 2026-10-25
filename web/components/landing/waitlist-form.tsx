"use client";

/**
 * The waitlist's email field and button, one row at the height of the Open app pill it replaces. The result takes
 * the same row and an error sits under it out of the flow, so nothing on the page moves.
 */
import * as React from "react";
import { Check } from "lucide-react";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

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

export function WaitlistForm({ tone = "dark", from, className }: { tone?: "dark" | "onLime"; from: string; className?: string }) {
  const t = TONES[tone];
  const [state, setState] = React.useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = React.useState<string | null>(null);

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
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

  if (state === "done") {
    return (
      <p role="status" className={cn("flex h-14 items-center gap-2 text-[17px] font-bold", className)}>
        <Check className="size-5" aria-hidden />
        You&apos;re on the list.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className={cn("relative flex gap-2", className)}>
      <label htmlFor={`waitlist-${from}`} className="sr-only">Email</label>
      <input
        id={`waitlist-${from}`}
        data-waitlist-input
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="you@email.com"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `waitlist-${from}-error` : undefined}
        className={cn("h-14 min-w-0 flex-1 rounded-full px-5 text-[17px]", ring, t.input)}
      />
      {/* Off screen and out of the tab order: only a bot fills it. */}
      <input name="company" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] size-px opacity-0" />
      <button
        type="submit"
        disabled={state === "sending"}
        className={cn("inline-flex h-14 shrink-0 items-center justify-center rounded-full px-6 text-[17px] font-bold whitespace-nowrap transition-[filter,opacity] disabled:opacity-70", ring, t.button)}
      >
        Join waitlist
      </button>
      {error && (
        <p id={`waitlist-${from}-error`} role="alert" className={cn("absolute top-full left-5 mt-2 text-[14px]", t.error)}>
          {error}
        </p>
      )}
    </form>
  );
}
