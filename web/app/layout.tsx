import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { AppShell } from "@/components/shell/app-shell";
import { cn } from "@/lib/utils";

/** One face for everything that reads; the mono carries numbers, conditions, labels and addresses. */
const grotesk = Schibsted_Grotesk({ subsets: ["latin"], weight: ["500", "600", "700", "800"], variable: "--font-grotesk", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jetbrains", display: "swap" });

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://koul-stellar.vercel.app";
const DESCRIPTION = "Conditional execution for your DeFi positions, from your own wallet. Write a rule once: it lives on-chain, and your own wallet runs it through a key that can only do the few things you allowed. Stellar testnet.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: "Koul · Conditional execution for your own wallet", template: "%s · Koul" },
  description: DESCRIPTION,
  applicationName: "Koul",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Koul" },
  openGraph: {
    type: "website",
    siteName: "Koul",
    url: SITE,
    title: "Set the rules once. Koul does the rest.",
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: "Set the rules once. Koul does the rest.", description: DESCRIPTION },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
    { media: "(prefers-color-scheme: light)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn(grotesk.variable, jetbrains.variable)} suppressHydrationWarning>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
