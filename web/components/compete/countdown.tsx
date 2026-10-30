"use client";

/** Time left to a moment, ticking each second. The first render uses the server's clock so it matches on hydration. */
import * as React from "react";

const pad = (n: number) => String(n).padStart(2, "0");

export function Countdown({ to, serverNow, className }: { to: number; serverNow: number; className?: string }) {
  const [now, setNow] = React.useState(serverNow);
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((to - now) / 1000));
  const d = Math.floor(s / 86_400), h = Math.floor((s % 86_400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return (
    <span className={className} role="timer" aria-label={`${d} days ${h} hours ${m} minutes left`}>
      {d > 0 && <>{d}d </>}{pad(h)}:{pad(m)}:{pad(sec)}
    </span>
  );
}
