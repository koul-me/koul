"use client";

/**
 * Pull down from the top of the page to refresh, on touch screens. The content follows the finger with resistance,
 * a ring of dots fills in as the pull deepens, and past the line it spins while the data reloads, then the page
 * settles back. The mouse never triggers it; with reduced motion on it still works, without the stretch.
 */
import * as React from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform, type MotionValue } from "motion/react";
import { SPRING_SOFT } from "@/lib/motion";

const TRIGGER = 64;
const HOLD = 52;
const DOTS = 8;

/** Resistance: the page moves less the further it is pulled, and never past 96 px. */
const rubber = (dy: number) => 96 * (1 - Math.exp(-dy / 160));

function Dots({ pull, spinning }: { pull: MotionValue<number>; spinning: boolean }) {
  const filled = useTransform(pull, (v) => Math.min(DOTS, Math.floor((v / TRIGGER) * DOTS)));
  const [count, setCount] = React.useState(0);
  React.useEffect(() => filled.on("change", setCount), [filled]);
  const opacity = useTransform(pull, [0, 24], [0, 1]);
  return (
    <motion.div className="absolute inset-x-0 top-0 flex justify-center" style={{ opacity, height: pull }} aria-hidden>
      <motion.div
        className="relative mt-4 size-6"
        animate={spinning ? { rotate: 360 } : { rotate: 0 }}
        transition={spinning ? { repeat: Infinity, duration: 0.9, ease: "linear" } : { duration: 0 }}
      >
        {Array.from({ length: DOTS }, (_, i) => {
          const a = (i / DOTS) * Math.PI * 2 - Math.PI / 2;
          return (
            <span
              key={i}
              className="absolute size-[5px] rounded-full bg-text"
              style={{ left: `${50 + Math.cos(a) * 40}%`, top: `${50 + Math.sin(a) * 40}%`, transform: "translate(-50%, -50%)", opacity: spinning ? 0.35 + (i / DOTS) * 0.65 : i < count ? 1 : 0.15 }}
            />
          );
        })}
      </motion.div>
    </motion.div>
  );
}

export function PullToRefresh({ onRefresh, children }: { onRefresh: () => Promise<unknown>; children: React.ReactNode }) {
  const still = useReducedMotion() ?? false;
  const box = React.useRef<HTMLDivElement>(null);
  const pull = useMotionValue(0);
  const [spinning, setSpinning] = React.useState(false);
  const refreshRef = React.useRef(onRefresh);
  React.useEffect(() => { refreshRef.current = onRefresh; }, [onRefresh]);

  React.useEffect(() => {
    const el = box.current;
    if (!el) return;
    let startY: number | null = null;
    let busy = false;
    const onStart = (e: TouchEvent) => { if (!busy && window.scrollY <= 0 && e.touches.length === 1) startY = e.touches[0]!.clientY; };
    const onMove = (e: TouchEvent) => {
      if (startY === null) return;
      const dy = e.touches[0]!.clientY - startY;
      if (dy <= 0) { pull.set(0); return; }
      // Holding the page still here stops the browser's own bounce from fighting the pull.
      e.preventDefault();
      pull.set(rubber(dy));
    };
    const onEnd = async () => {
      if (startY === null) return;
      startY = null;
      if (pull.get() < TRIGGER * 0.9) { animate(pull, 0, SPRING_SOFT); return; }
      busy = true;
      setSpinning(true);
      animate(pull, HOLD, SPRING_SOFT);
      // A short floor, so a fast reload still reads as a refresh rather than a flicker.
      await Promise.all([refreshRef.current().catch(() => undefined), new Promise((r) => setTimeout(r, 700))]);
      setSpinning(false);
      animate(pull, 0, SPRING_SOFT);
      busy = false;
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [pull]);

  return (
    <div ref={box} className="relative">
      <Dots pull={pull} spinning={spinning} />
      <motion.div style={{ y: still ? 0 : pull }}>{children}</motion.div>
      <span className="sr-only" role="status" aria-live="polite">{spinning ? "Refreshing" : ""}</span>
    </div>
  );
}
