"use client";

/**
 * On app.koul.me the competition pages wear the app's frame: its top bar (the wordmark goes to app Home, Compete is
 * the lit tab, the wallet chip) and, on phones, its tab bar.
 */
import { AppBaseProvider } from "@/lib/app-base";
import { useWallet } from "@/hooks/use-wallet";
import { TopBar } from "@/components/shell/top-bar";
import { BottomTabs } from "@/components/shell/bottom-tabs";

export function CompeteAppBar() {
  const w = useWallet();
  const connected = !!w.address;
  return (
    <AppBaseProvider base="">
      <TopBar connected={connected} />
      {connected && <BottomTabs />}
    </AppBaseProvider>
  );
}
