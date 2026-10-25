"use client";

import { ThemeProvider } from "next-themes";
import { MotionConfig } from "motion/react";
import { tween } from "@/lib/motion";
import { PasskeyWalletProvider, SEMBOL_TESTNET_ARTIFACTS, type SembolConfig } from "@sembol/passkey-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { loadHubNames } from "@/lib/model/hubs";

/**
 * Passkeys belong to a domain. The app moved from koul.me to app.koul.me, so on any koul.me host the passkey is
 * pinned to koul.me itself: wallets made on koul.me keep working on app.koul.me, and new ones work on both. Other
 * hosts (localhost, *.vercel.app) keep the default, their own domain.
 */
const host = typeof window === "undefined" ? "" : window.location.hostname;
const rpId = host === "koul.me" || host.endsWith(".koul.me") ? "koul.me" : undefined;

/**
 * Koul's own relay (app/api/relay) pays for wallet deploys, which SDF's relayer no longer sponsors for this account
 * build, and passes every other request on to SDF's relayer.
 */
const relayerUrl = typeof window === "undefined" ? SEMBOL_TESTNET_ARTIFACTS.relayerUrl : `${window.location.origin}/api/relay`;

const config: SembolConfig = {
  ...SEMBOL_TESTNET_ARTIFACTS,
  relayerUrl,
  appName: "Koul",
  webAuthnHints: ["client-device", "hybrid"],
  ...(rpId ? { rpId } : {}),
};

// XOXNO's hub names, once per page load; labels drawn after use them, the defaults stand until then.
if (typeof window !== "undefined") void loadHubNames();

/** Dark is the default; the light theme is a class on <html>, toggled on the Account page. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" themes={["dark", "light"]} enableSystem={false}>
      {/* reducedMotion="user": with the system preference on, transforms stop and only opacity moves. */}
      <MotionConfig reducedMotion="user" transition={tween()}>
        <PasskeyWalletProvider config={config}>
          <TooltipProvider delay={200}>
            {children}
            <Toaster position="top-center" closeButton />
          </TooltipProvider>
        </PasskeyWalletProvider>
      </MotionConfig>
    </ThemeProvider>
  );
}
