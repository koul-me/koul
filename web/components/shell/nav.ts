import { House, List, SlidersHorizontal, User, type LucideIcon } from "lucide-react";

export interface Tab { href: string; label: string; icon: LucideIcon; active: (pathname: string) => boolean }

/** The four tabs. Deposit and Withdraw are reached from Home and Account and light the Account tab. */
export const TABS: Tab[] = [
  { href: "/app", label: "Home", icon: House, active: (p) => p === "/app" },
  { href: "/app/autopilot", label: "Autopilot", icon: SlidersHorizontal, active: (p) => p.startsWith("/app/autopilot") },
  { href: "/app/activity", label: "Activity", icon: List, active: (p) => p.startsWith("/app/activity") },
  { href: "/app/account", label: "Account", icon: User, active: (p) => p.startsWith("/app/account") || p.startsWith("/app/deposit") || p.startsWith("/app/withdraw") },
];

/** Deposit and Withdraw are narrow single-column flows: no bottom tab bar, and on phones no top bar either. */
export const isFlowRoute = (pathname: string) => pathname.startsWith("/app/deposit") || pathname.startsWith("/app/withdraw");
