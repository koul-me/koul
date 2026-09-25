/**
 * The hero animation's two faces, as designed: Archivo (display at font-stretch 112%, weight 800, and the body
 * text) and JetBrains Mono (numbers and the typed rule). Archivo loads as a variable font with its width axis so
 * font-stretch 112% is real, not synthesised. The mono falls back to another monospace font, never to a
 * size-adjusted Arial: the typing effect animates width in ch, so the fallback has to stay monospaced.
 */
import { Archivo, JetBrains_Mono } from "next/font/google";

export const heroDisplay = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-hero-display",
  display: "swap",
});

export const heroMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-hero-mono",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
});
