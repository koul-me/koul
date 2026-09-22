"use client";

/**
 * The landing page: what Koul is, in the order a visitor needs it. It replaces the Welcome screen at "/" while no
 * wallet is connected; the two passkey buttons start the same flows the app has always used. Nothing here reads
 * the chain, and every number on the page is an example.
 */
import { Hero } from "./hero";
import { BuiltOn, FinalCta, Footer } from "./close";

export function Landing() {
  return (
    <div className="min-w-0">
      <header className="mx-auto flex w-full max-w-[1280px] items-center justify-between px-4 py-6 md:px-8">
        <span className="text-[24px] font-extrabold tracking-tight md:text-[28px]">KOUL</span>
        <a href="#build" className="label rounded-full px-4 py-3 text-muted transition-colors hover:text-text">Try a rule ↓</a>
      </header>
      <main>
        <Hero />
        <BuiltOn />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
