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

  return (
    <div ref={rootRef} className={cx(heroDisplay.variable, heroMono.variable, s.root, className)}>
      <div className={s.canvas}>
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
        <Finale showTagline={showTagline} />
      </div>
    </div>
  );
}
