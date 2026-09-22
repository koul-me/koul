/** The share card, in the Signal palette: black ground, one lime line, the headline. Rendered at build time. */
import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Koul · Set the rules once. Koul does the rest.";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#000000", color: "#ffffff", padding: 72, fontFamily: "system-ui, sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 40, fontWeight: 800, letterSpacing: -1 }}>
            <svg width="52" height="52" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="21" fill="none" stroke="#ffffff" strokeWidth="10" />
              <circle cx="46.8" cy="17.2" r="12.5" fill="#000000" />
              <circle cx="46.8" cy="17.2" r="10" fill="#c8f23a" />
            </svg>
            KOUL
          </div>
          <div style={{ fontSize: 22, letterSpacing: 2, color: "#c8f23a" }}>CONDITIONAL EXECUTION</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 84, fontWeight: 800, letterSpacing: -3, lineHeight: 1.02, maxWidth: 940 }}>Set the rules once. Koul does the rest.</div>
          <div style={{ marginTop: 28, fontSize: 30, color: "#9a9a9a", maxWidth: 860 }}>Conditional execution for your DeFi positions, from your own wallet.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ display: "flex", background: "#c8f23a", color: "#0a0f00", borderRadius: 999, padding: "14px 28px", fontSize: 24, fontWeight: 700 }}>IF loan health &lt; 1.25 → Repay debt</div>
          <div style={{ fontSize: 22, color: "#9a9a9a" }}>Stellar testnet</div>
        </div>
      </div>
    ),
    size,
  );
}
