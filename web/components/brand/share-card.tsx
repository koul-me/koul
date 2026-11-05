/**
 * The pieces the share cards (opengraph-image routes) are built from: the brand fonts as TTF (the image renderer reads
 * no woff2), the Orbit mark, and the lime link pill. Cards are 1200 × 630 and rendered at build time.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const SHARE_SIZE = { width: 1200, height: 630 };
export const LIME = "#c8f23a";
export const INK = "#0a0f00";

export async function shareFonts() {
  const read = (f: string) => readFile(join(process.cwd(), "assets", f));
  const [bold, semi, mono] = await Promise.all([read("SchibstedGrotesk-800.ttf"), read("SchibstedGrotesk-600.ttf"), read("JetBrainsMono-500.ttf")]);
  return [
    { name: "Grotesk", data: bold, weight: 800 as const, style: "normal" as const },
    { name: "Grotesk", data: semi, weight: 600 as const, style: "normal" as const },
    { name: "Mono", data: mono, weight: 500 as const, style: "normal" as const },
  ];
}

export function ShareMark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 30, fontWeight: 800, letterSpacing: -1 }}>
      <svg width="38" height="38" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="21" fill="none" stroke="#ffffff" strokeWidth="10" />
        <circle cx="46.8" cy="17.2" r="12.5" fill="#000000" />
        <circle cx="46.8" cy="17.2" r="10" fill={LIME} />
      </svg>
      KOUL
    </div>
  );
}

export function SharePill({ children }: { children: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: LIME, color: INK, borderRadius: 999, padding: "14px 26px", fontSize: 26, fontWeight: 800, letterSpacing: -0.5 }}>
      {children}
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
    </div>
  );
}

export const shareTag = { fontFamily: "Mono", fontSize: 18, letterSpacing: 2, color: "#9a9a9a" } as const;
