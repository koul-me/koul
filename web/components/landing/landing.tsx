"use client";

/**
 * The landing page: what Koul is, in the order a visitor needs it. It replaces the Welcome screen at "/" while no
 * wallet is connected; the two passkey buttons start the same flows the app has always used. Nothing here reads
 * the chain, and every number on the page is an example.
 */
import { TopBar } from "./top";
import { Hero } from "./hero";
import { Problem } from "./problem";
import { How } from "./how";
import { Playground } from "./playground";
import { UseCases } from "./use-cases";
import { Safety } from "./safety";
import { BuiltOn, FinalCta, Footer } from "./close";

export function Landing() {
  return (
    <div className="min-w-0">
      <TopBar />
      <main>
        <Hero />
        <Problem />
        <UseCases />
        <How />
        <Playground />
        <Safety />
        <BuiltOn />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
