/**
 * The parts of the hero animation. None of them keeps time: every animated element carries its own class from the
 * CSS module, and every class runs the same 16 s keyframe clock from the moment the animation mounts, so the parts
 * stay in sync whatever the layout does.
 */
import * as React from "react";
import Link from "next/link";
import { track } from "@/lib/analytics";
import { APP_PATH } from "../shell";
import s from "./koul-hero-animation.module.css";

export const cx = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).join(" ");

const LINE = "M0 117.9 L40 125.0 L80 110.3 L120 122.5 L160 130.8 L200 124.0 L240 142.5 L280 135.2 L320 150.9 L360 146.2 L400 163.0 L440 170.2 L480 161.1 L520 183.8 L560 196.7 L585 210.0 L610 216.3 L640 219.1";
const AREA = `${LINE} L640 300 L0 300 Z`;
const CHECK = "M2.5 7.5 L5.8 10.5 L11.5 3.8";
const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/** The chat box: the placeholder, the rule typed in two lines with its highlight, and the (decorative) send button. */
export function ChatBox() {
  return (
    <div className={s.chat}>
      <div className={cx(s.mono, s.typed)} aria-hidden="true">
        <div className={cx(s.ph, s.placeholder)}>Tell Koul what to do</div>
        <div className={cx(s.lv1, s.typedLine)}>
          <span className={cx(s.hl, s.mark, s.mark1)} />
          <span className={cx(s.ty1, s.typing)}>If Bitcoin drops below $110k,</span>
        </div>
        <div className={cx(s.lv2, s.typedLine)}>
          <span className={cx(s.hl, s.mark, s.mark2)} style={{ animationDelay: ".2s" }} />
          <span className={cx(s.ty2, s.typing)}>move half my BTC supply to USDC.</span>
        </div>
      </div>
      <div className={s.chatFoot}>
        <span className={s.chatLabel}>Autopilot</span>
        <span className={cx(s.send, s.sendButton)} aria-hidden="true">
          <svg className={s.sendIcon} width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M10 16 L10 4 M4.5 9.5 L10 4 L15.5 9.5" fill="none" stroke="#0A0F00" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
    </div>
  );
}

/** Rule 1: its status pill (Watching, Triggered, Done) and the When / Then chips. */
export function RuleCard() {
  return (
    <div className={cx(s.card, s.ruleCard)}>
      <div className={s.row}>
        <span className={cx(s.disp, s.cardTitle)}>Rule 1</span>
        <div className={s.pillSlot}>
          <span className={cx(s.pw, s.pill, s.pillWatch)}>
            <span className={s.dotWrap}>
              <span className={cx(s.pulse, s.dot)} />
              <span className={s.dot} />
            </span>
            Watching
          </span>
          <span className={cx(s.pt, s.pill, s.pillTrig)}>Triggered</span>
          <span className={cx(s.pd, s.pill, s.pillDone)}>
            <svg className={s.pillIcon} width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d={CHECK} fill="none" stroke="#C8F03C" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Done
          </span>
        </div>
      </div>
      <div className={s.chips}>
        <div className={cx(s.chipin, s.chipRow)}>
          <span className={s.chipLabel}>When</span>
          <span className={cx(s.mono, s.chip)}>BTC price &lt; <span className={cx(s.valpulse, s.value)}>$110,000</span></span>
        </div>
        <div className={cx(s.chipin, s.chipRow)} style={{ animationDelay: ".3s" }}>
          <span className={s.chipLabel}>Then</span>
          <span className={cx(s.mono, s.chip)}>Move 50% of BTC supply to USDC</span>
        </div>
      </div>
    </div>
  );
}

/** One rolling digit of the price: a column of 0-9 that its reel class moves. */
function Reel({ reel }: { reel: string }) {
  return (
    <span className={s.digitWindow}>
      <span className={cx(reel, s.reel)}>
        {DIGITS.map((d) => <span key={d} className={s.digit}>{d}</span>)}
      </span>
    </span>
  );
}

/** The chart as designed for the wide layout: 640 x 300. */
function WideChart() {
  return (
    <svg className={s.chartWide} width="640" height="300" viewBox="0 0 640 300" aria-hidden="true">
      <g stroke="#1C1C1C" strokeWidth="1"><line x1="0" y1="60" x2="640" y2="60" /><line x1="0" y1="135" x2="640" y2="135" /><line x1="0" y1="285" x2="640" y2="285" /></g>
      <path className={s.area} d={AREA} fill="#C8F03C" fillOpacity=".07" />
      <g className={s.thr}><line className={s.thrline} x1="0" y1="210" x2="640" y2="210" stroke="#C8F03C" strokeWidth="1.5" strokeDasharray="6 7" /></g>
      <g className={s.thrlab}><rect x="8" y="218" width="176" height="26" rx="13" fill="#1A1A1A" stroke="#2A2A2A" /><text x="96" y="235.5" textAnchor="middle" fontSize="12.5" fill="#C8F03C">Rule 1 at $110,000</text></g>
      <path className={s.pp} d={LINE} pathLength="100" fill="none" stroke="#F2F2F2" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle className={s.burst} cx="585" cy="210" r="8" fill="none" stroke="#C8F03C" strokeWidth="2.5" />
      <circle className={cx(s.burst, s.burst2)} cx="585" cy="210" r="8" fill="none" stroke="#C8F03C" strokeWidth="1.5" />
      <g className={s.mover}><circle className={s.halo} cx="0" cy="0" r="7" fill="#C8F03C" fillOpacity=".45" /><circle className={s.cross} cx="0" cy="0" r="6" fill="#F2F2F2" /></g>
      <g className={s.tlab}><rect x="400" y="246" width="210" height="30" rx="15" fill="#C8F03C" /><text x="505" y="265.5" textAnchor="middle" fontSize="13" fontWeight="700" fill="#0A0F00">Triggered at $110,000</text></g>
    </svg>
  );
}

/** BTC: the rolling price and the chart that crosses the rule's level. */
export function PriceChart() {
  return (
    <div className={cx(s.punch, s.chartCard)}>
      <div className={s.chartHead}>
        <div className={s.chartName}>
          <span className={cx(s.disp, s.chartTitle)}>BTC</span>
          <span className={s.chartSub}>Bitcoin in USD</span>
        </div>
        <span className={cx(s.mono, s.tick, s.price)}>
          $1<Reel reel={s.r1} /><Reel reel={s.r2} />,<Reel reel={s.r3} /><Reel reel={s.r4} /><Reel reel={s.r5} />
        </span>
      </div>
      <WideChart />
    </div>
  );
}

/** The XOXNO supply split, the flow from BTC to USDC, and the line saying what Rule 1 did. */
export function SupplyTile() {
  return (
    <div className={cx(s.shine, s.supply)}>
      <div className={s.supplyHead}>
        <span className={cx(s.disp, s.supplyTitle)}>Your supply on XOXNO</span>
      </div>
      <div className={s.bar}>
        <div className={cx(s["seg-x"], s.seg, s.segBtc)} />
        <div className={cx(s["seg-u"], s.seg, s.segUsdc)} />
        {["0.0s", "0.13s", "0.26s", "0.39s", "0.52s", "0.65s"].map((d) => (
          <span key={d} className={cx(s.fdot, s.flowDot)} style={{ animationDelay: d }} />
        ))}
      </div>
      <div className={cx(s.mono, s.split)}>
        <span className={s.splitCell}>
          <span className={cx(s.before, s.splitValue, s.splitStart)}>BTC 80%</span>
          <span className={cx(s.after, s.splitValue, s.splitStart)}>BTC 40%</span>
        </span>
        <span className={cx(s.splitCell, s.splitCellEnd)}>
          <span className={cx(s.before, s.splitValue, s.splitEnd)}>USDC 20%</span>
          <span className={cx(s.after, s.splitValue, s.splitEnd)}>USDC 60%</span>
        </span>
      </div>
      <div className={cx(s.act, s.actRow)}>
        <span className={s.actIcon}>
          <svg className={s.actIconSvg} width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d={CHECK} fill="none" stroke="#0A0F00" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span>Rule 1 moved half your BTC supply to USDC.</span>
        <span className={s.actTime}>Just now</span>
      </div>
    </div>
  );
}

const LINE_1 = [["Set", "0.0s"], ["the", "0.07s"], ["rules", "0.14s"], ["once.", "0.21s"]];
const LINE_2 = [["Koul", "0.28s"], ["does", "0.35s"], ["the", "0.42s"], ["rest.", "0.49s"]];

/** One tagline line, its words in pairs (the phone layout sets each pair on its own line). */
function TaglineLine({ words, tone }: { words: string[][]; tone: string }) {
  const word = ([w, d]: string[]) => <span key={d} className={cx(s.tw, s.word, tone)} style={{ animationDelay: d }}>{w}</span>;
  return (
    <div className={cx(s.disp, s.tagline)} aria-hidden="true">
      <span className={s.pair}>{word(words[0]!)} {word(words[1]!)}</span> <span className={s.pair}>{word(words[2]!)} {word(words[3]!)}</span>
    </div>
  );
}

/**
 * The finale: the tagline over the dimmed dashboard, the line under it, Open app and Replay. The buttons are real
 * controls; until they fade in they are visibility: hidden, so they can be neither clicked nor focused.
 */
export function Finale({ showTagline, onReplay }: { showTagline: boolean; onReplay: () => void }) {
  return (
    <div className={s.finale}>
      {showTagline && <TaglineLine words={LINE_1} tone={s.wordLight} />}
      {showTagline && <TaglineLine words={LINE_2} tone={s.wordLime} />}
      <div className={cx(s.sub, s.mono, s.subline)} aria-hidden="true">Lending autopilot on XOXNO</div>
      <div className={s.actions}>
        {/* No prefetch: on koul.me /app answers with a redirect to app.koul.me, which only a full navigation follows. */}
        <Link href={APP_PATH} prefetch={false} className={cx(s.cta, s.open)} onClick={() => track("open_app", { from: "hero_animation" })}>
          Open app
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M4 9 H14 M9.5 4.5 L14 9 L9.5 13.5" fill="none" stroke="#0A0F00" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </Link>
        <button type="button" className={cx(s.cta, s.ghost, s.replay)} style={{ animationDelay: ".12s" }} onClick={onReplay}>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M3.5 9 A5.5 5.5 0 1 0 5.2 5 M3.5 2.8 V5.6 H6.3" fill="none" stroke="#F2F2F2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Replay
        </button>
      </div>
    </div>
  );
}
