"use client";

/**
 * Where the app's pages live on the current host. On app.koul.me the app is the whole site, so the base is "" and
 * Autopilot is /autopilot. Everywhere else (koul.me before its redirect, localhost, *.vercel.app) the landing owns
 * "/" and the app sits under /app. The app layout reads the host on the server and provides the base, so links
 * render the same on the server and in the browser. Pages and links speak app paths ("/", "/autopilot") only.
 */
import * as React from "react";
import { usePathname } from "next/navigation";
import { appHrefFor, appPathFor } from "@/lib/app-host";

const AppBase = React.createContext("/app");

export function AppBaseProvider({ base, children }: { base: string; children: React.ReactNode }) {
  return <AppBase.Provider value={base}>{children}</AppBase.Provider>;
}

/** Turns an app path ("/", "/autopilot?load=x") into the href for this host. */
export function useAppHref(): (path: string) => string {
  const base = React.useContext(AppBase);
  return React.useCallback((path: string) => appHrefFor(base, path), [base]);
}

/** The current app path, without the base: "/" for Home, "/autopilot" for Autopilot. */
export function useAppPathname(): string {
  const base = React.useContext(AppBase);
  return appPathFor(base, usePathname());
}

/** The full URL of the app's root on this host, for links that leave the page (share links). */
export function useAppOrigin(): () => string {
  const base = React.useContext(AppBase);
  return React.useCallback(() => `${window.location.origin}${base}`, [base]);
}
