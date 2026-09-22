import { headers } from "next/headers";
import { AppShell } from "@/components/shell/app-shell";
import { AppBaseProvider } from "@/lib/app-base";
import { appBaseFor } from "@/lib/app-host";

/**
 * Everything the app shows sits in the app frame: top bar, tabs, and the Welcome screen until a wallet connects.
 * On an app. host the proxy serves these routes at the root, so links drop the /app prefix there.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const host = (await headers()).get("host") ?? "";
  return (
    <AppBaseProvider base={appBaseFor(host)}>
      <AppShell>{children}</AppShell>
    </AppBaseProvider>
  );
}
