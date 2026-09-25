"use client";

/**
 * The Koul hero animation: a user types a rule, Koul compiles it into Rule 1, BTC falls through $110,000, the rule
 * triggers and the XOXNO supply rebalances. Pure CSS on one 16 s timeline; it loops by remounting the timeline once
 * the dashboard has dimmed (84.5 % of the clock, where the source's finale used to begin). On desktop the
 * 1440 x 860 composition is kept whole and fitted to the hero's width.
 */
import * as React from "react";
import s from "./koul-hero-animation.module.css";
import { heroDisplay, heroMono } from "./fonts";
import { ChatBox, PriceChart, RuleCard, SupplyTile, cx } from "./parts";

const LABEL = "Animation: a user types a rule, if Bitcoin drops below 110 thousand dollars, move half my BTC supply to USDC. Koul turns it into Rule 1 and starts watching. The Bitcoin price falls and crosses 110,000, the rule triggers, and Koul immediately shifts the XOXNO supply from 80 percent BTC to 40 percent, with USDC going from 20 to 60 percent.";
const DESIGN_WIDTH = 1440;
/** Where the loop restarts: the end of the dashboard's dim and blur, 84.5 % of the 16 s clock. */
const LOOP_AT_MS = 16000 * 0.845;

export function KoulHeroAnimation({ className }: { className?: string }) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  // Each pass remounts the whole timeline, so every part starts again from 0 together.
  const [run, setRun] = React.useState(0);

  // Loop: watch the board's own clock, not wall time, so a paused animation (off screen, hidden tab) waits too.
  // Under reduced motion there is no animation to watch, and the still frame stays.
  React.useEffect(() => {
    const id = window.setInterval(() => {
      const board = rootRef.current?.querySelector(`.${s.board}`);
      const clock = board?.getAnimations()[0];
      if (clock && Number(clock.currentTime) >= LOOP_AT_MS) setRun((n) => n + 1);
    }, 100);
    return () => window.clearInterval(id);
  }, []);

  // The desktop composition scales to the hero's width as one piece.
  React.useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry?.contentRect.width ?? DESIGN_WIDTH;
      el.style.setProperty("--hero-s", String(Math.min(1, w / DESIGN_WIDTH)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Pause off screen and in a hidden tab. One attribute on the root pauses every animation at once, so on resume
  // the parts continue from the same moment, still in sync.
  React.useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    let onScreen = true;
    const apply = () => el.setAttribute("data-paused", String(!onScreen || document.visibilityState === "hidden"));
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry?.isIntersecting ?? true;
      apply();
    });
    io.observe(el);
    document.addEventListener("visibilitychange", apply);
    apply();
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", apply);
    };
  }, []);

  return (
    <div ref={rootRef} className={cx(heroDisplay.variable, heroMono.variable, s.root, className)}>
      <div key={run} className={s.canvas}>
        <div className={cx(s.board, s.boardLayout)} role="img" aria-label={LABEL}>
          <div className={s.colL}>
            <ChatBox />
            <RuleCard />
          </div>
          <div className={s.colR}>
            <PriceChart />
            <SupplyTile />
          </div>
        </div>
      </div>
    </div>
  );
}
