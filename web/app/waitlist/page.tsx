import type { Metadata } from "next";
import { headers } from "next/headers";
import { KoulMark } from "@/components/brand/koul-mark";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { WaitlistForm } from "@/components/landing/waitlist-form";
import { ThemeColor } from "@/components/shell/theme-color";
import { Label } from "@/components/signal";
import { isAppHost } from "@/lib/app-host";

export const metadata: Metadata = { title: "Waitlist", robots: { index: false } };

/**
 * What an app page shows while the waitlist is on: proxy.ts rewrites to it in place, so the address stays the app's.
 * It sits outside app/app on purpose: no wallet, no passkey, nothing that talks to the chain.
 */
export default async function WaitlistPage({ searchParams }: { searchParams: Promise<{ invalid?: string }> }) {
  const host = (await headers()).get("host") ?? "";
  // proxy.ts adds invalid=1 when the invite code someone tried does not work.
  const invalid = (await searchParams).invalid === "1";
  const landing = isAppHost(host) ? "https://koul.me" : "/";
  return (
    <>
      <ThemeColor />
      <div className="flex min-h-dvh flex-col">
        <header className="mx-auto flex w-full max-w-[1280px] items-center justify-between px-4 py-4 md:px-8 md:py-5">
          <a href={landing} className="inline-flex items-center gap-2 text-[24px] font-extrabold tracking-tight md:text-[28px]">
            <KoulMark className="size-7 md:size-8" />KOUL
          </a>
          <ThemeToggle />
        </header>
        <main className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col justify-center px-4 pb-24 md:px-8">
          <h1 className="t-headline max-w-[14ch]">Join the waitlist.</h1>
          <p className="mt-6 max-w-[46ch] text-[19px] text-muted md:text-[22px]">Koul opens in batches. We&apos;ll email you when it&apos;s your turn.</p>
          <WaitlistForm from="app" initialMode={invalid ? "code" : "email"} initialError={invalid ? "That code doesn't work." : null} className="mt-8 w-full md:w-[480px]" />
          <Label className="mt-8">Stellar testnet</Label>
        </main>
      </div>
    </>
  );
}
