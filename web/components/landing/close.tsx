"use client";

/** What Koul is built on, the last call to action, and the footer. Plain names, no logos, nothing claimed. */
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Label } from "@/components/signal";
import { TELEGRAM_URL } from "@/lib/community";
import { StartButtons, Section } from "./shell";
import { KoulMark } from "@/components/brand/koul-mark";
import { Marquee } from "@/components/ui/marquee";
import { DotPattern } from "@/components/ui/dot-pattern";
import ShinyText from "@/components/ShinyText";

/** What Koul stands on. Names, set large; no logos until the marks are ours to use. */
const BUILT_ON = ["Stellar", "Soroban", "XOXNO", "Passkeys", "OpenZeppelin"];

export function BuiltOn() {
  return (
    <Section title="Built on Stellar">
      {/* Research: Magic UI Marquee, the names on a slow loop with faded edges. */}
      <div className="relative mt-10 [mask-image:linear-gradient(to_right,transparent,#000_10%,#000_90%,transparent)]">
        <Marquee pauseOnHover className="p-0 [--duration:28s] [--gap:3rem]">
          {BUILT_ON.map((name) => (
            <span key={name} className="text-[26px] font-extrabold leading-none tracking-tight md:text-[38px]">
              {name}
            </span>
          ))}
        </Marquee>
      </div>
    </Section>
  );
}

export function FinalCta() {
  return (
    <Section inner="relative isolate overflow-hidden rounded-[var(--radius-tile)] bg-lime px-6 py-14 text-on-lime md:px-12 md:py-20">
      {/* Research: Magic UI Dot Pattern behind, React Bits Shiny Text on the line. */}
      <DotPattern className="-z-10 text-on-lime/15 [mask-image:radial-gradient(ellipse_at_top_right,#000,transparent_70%)]" />
      <h2 className="t-headline max-w-[14ch]">
        <ShinyText text="Start with one rule." color="#0a0f00" shineColor="#6b8a12" speed={3} />
      </h2>
      <StartButtons tone="onLime" from="close" className="mt-8" />
    </Section>
  );
}

export function Footer() {
  return (
    <footer className="px-4 pb-16 md:px-8">
      <div className="mx-auto flex w-full max-w-[1280px] flex-wrap items-center justify-between gap-4 border-t border-line pt-8">
        <span className="inline-flex items-center gap-2 text-[22px] font-extrabold tracking-tight"><KoulMark className="size-6" />KOUL</span>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Label>Stellar testnet</Label>
          <Link href="/compete" className="label inline-flex min-h-11 items-center rounded-full text-muted transition-colors hover:text-text">Competition</Link>
          {TELEGRAM_URL && (
            <a href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer" className="label inline-flex min-h-11 items-center gap-2 rounded-full text-muted transition-colors hover:text-text">
              Telegram
              <ArrowUpRight className="size-3.5" aria-hidden />
            </a>
          )}
          <a
            href="https://github.com/koul-me"
            target="_blank"
            rel="noopener noreferrer"
            className="label inline-flex min-h-11 items-center gap-2 rounded-full text-muted transition-colors hover:text-text"
          >
            github.com/koul-me
            <ArrowUpRight className="size-3.5" aria-hidden />
          </a>
        </div>
      </div>
    </footer>
  );
}
