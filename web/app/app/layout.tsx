import { AppShell } from "@/components/shell/app-shell";

/** Everything under /app sits in the app frame: top bar, tabs, and the Welcome screen until a wallet connects. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
