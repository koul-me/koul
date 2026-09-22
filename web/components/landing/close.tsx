"use client";

/** What Koul is built on, the last call to action, and the footer. Plain names, no logos, nothing claimed. */
import { Label, Tile } from "@/components/signal";
import { StartButtons, Section } from "./shell";

const BUILT_ON = [
  { name: "Stellar", line: "Fast, cheap settlement" },
  { name: "Soroban", line: "The rules run as a smart contract" },
  { name: "XOXNO", line: "The lending pools your position sits in" },
  { name: "Passkeys", line: "Face or fingerprint, no seed phrase" },
  { name: "OpenZeppelin smart accounts", line: "The wallet that holds your funds" },
];

export function BuiltOn() {
  return (
    <Section label="Built on" title="Standing on work that already exists.">
      <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {BUILT_ON.map((b) => (
          <li key={b.name}>
            <Tile className="h-full p-6">
              <div className="text-[20px] font-bold">{b.name}</div>
              <div className="mt-1 text-[15px] text-muted">{b.line}</div>
            </Tile>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function FinalCta() {
  return (
    <Section inner="rounded-[var(--radius-tile)] bg-lime px-6 py-14 text-on-lime md:px-12 md:py-20">
      <h2 className="t-headline max-w-[14ch]">Set the rules once. Koul does the rest.</h2>
      <p className="mt-6 max-w-[46ch] text-[19px] md:text-[22px]">Write one rule, watch it run itself.</p>
      <StartButtons tone="onLime" className="mt-8" />
    </Section>
  );
}

export function Footer() {
  return (
    <footer className="px-4 pb-16 md:px-8">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-3 border-t border-line pt-8 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-[22px] font-extrabold tracking-tight">KOUL</span>
        <div className="grid gap-1 sm:text-right">
          <Label>Stellar testnet. Not financial advice.</Label>
          <Label tone="muted">Built at the Rise In x Stellar Pro Hackathon, Istanbul</Label>
        </div>
      </div>
    </footer>
  );
}
