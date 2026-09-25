"use client";

/**
 * The Koul hero animation: a user types a rule, Koul compiles it into Rule 1, BTC falls through $110,000, the rule
 * triggers and the XOXNO supply rebalances, then the tagline. Pure CSS on one 16 s timeline, played once, holding
 * its final frame. On desktop the 1440 x 860 composition is kept whole and fitted to the hero's width.
 */
import * as React from "react";
import s from "./koul-hero-animation.module.css";
import { heroDisplay, heroMono } from "./fonts";
import { ChatBox, Finale, PriceChart, RuleCard, SupplyTile, cx } from "./parts";

const LABEL = "Animation: a user types a rule, if Bitcoin drops below 110 thousand dollars, move half my BTC supply to USDC. Koul turns it into Rule 1 and starts watching. The Bitcoin price falls and crosses 110,000, the rule triggers, and Koul immediately shifts the XOXNO supply from 80 percent BTC to 40 percent, with USDC going from 20 to 60 percent. Then the tagline appears: Set the rules once. Koul does the rest.";
const DESIGN_WIDTH = 1440;

export function KoulHeroAnimation({ showTagline = true, className }: {
  /** The finale's tagline; turn it off when the hero headline already says it. The buttons stay either way. */
  showTagline?: boolean;
  className?: string;
}) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  // Replay remounts the whole timeline, so every part starts again from 0 together.
  const [run, setRun] = React.useState(0);
  const replay = React.useCallback(() => {
    setRun((n) => n + 1);
    // The Replay button is gone with the old timeline; keep keyboard focus in the animation instead of the page top.
    rootRef.current?.focus({ preventScroll: true });
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
    <div ref={rootRef} tabIndex={-1} className={cx(heroDisplay.variable, heroMono.variable, s.root, className)}>
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
        <Finale showTagline={showTagline} onReplay={replay} />
      </div>
    </div>
  );
}
