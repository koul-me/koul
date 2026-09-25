"use client";

/**
 * The hero: the headline word by word (in CSS, so it reads before any script runs), the line, Open app, and under
 * them the hero animation: a rule typed, compiled, triggered and carried out, in one 16 s pass.
 */
import * as React from "react";
import { StartButtons } from "./shell";
import { KoulHeroAnimation } from "./hero-animation/koul-hero-animation";

const HEADLINE = ["Set", "the", "rules", "once.", "Koul", "does", "the", "rest."];

export function Hero() {
  return (
    <section className="px-4 pt-6 pb-16 md:px-8 md:pt-10 md:pb-24">
      <div className="mx-auto w-full max-w-[1280px]">
        <h1 className="t-headline max-w-[14ch]">
          {/* The space sits between the word spans: inside an inline-block a trailing space collapses to nothing. */}
          {HEADLINE.map((w, i) => (
            <React.Fragment key={`${w}-${i}`}>
              <span className="animate-rise inline-block" style={{ animationDelay: `${60 + i * 55}ms` }}>{w}</span>
              {i < HEADLINE.length - 1 ? " " : null}
            </React.Fragment>
          ))}
        </h1>
        <p className="mt-6 max-w-[46ch] text-[19px] text-muted md:text-[22px]">
          Automate your DeFi position from your own wallet.
        </p>
        <StartButtons from="hero" className="mt-8" />
        {/* Full width on phones, like the 390 px design; a dark panel in the column from tablet up. */}
        <KoulHeroAnimation className="-mx-4 mt-10 md:mx-0 md:mt-14" />
      </div>
    </section>
  );
}
