"use client";

/**
 * The hero: the headline word by word (in CSS, so it reads before any script runs), the line, Open app, and under
 * them the hero animation: a rule typed, compiled, triggered and carried out, in one 16 s pass.
 */
import { StartButtons } from "./shell";
import { KoulHeroAnimation } from "./hero-animation/koul-hero-animation";

const HEADLINE = ["Set", "the", "rules", "once.", "Koul", "does", "the", "rest."];

export function Hero() {
  return (
    <section className="px-4 pt-6 pb-16 md:px-8 md:pt-10 md:pb-24">
      <div className="mx-auto w-full max-w-[1280px]">
        <h1 className="t-headline max-w-[14ch]">
          {HEADLINE.map((w, i) => (
            <span key={`${w}-${i}`} className="animate-rise inline-block" style={{ animationDelay: `${60 + i * 55}ms` }}>
              {w}
              {i < HEADLINE.length - 1 ? " " : ""}
            </span>
          ))}
        </h1>
        <p className="mt-6 max-w-[46ch] text-[19px] text-muted md:text-[22px]">
          Automate your DeFi position from your own wallet.
        </p>
        <StartButtons from="hero" className="mt-8" />
        <KoulHeroAnimation className="mt-10 md:mt-14" />
      </div>
    </section>
  );
}
