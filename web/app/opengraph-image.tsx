/** The site's share card: the headline, one rule as an example, and the link. Rendered at build time. */
import { ImageResponse } from "next/og";
import { INK, LIME, SHARE_SIZE, ShareMark, SharePill, shareFonts, shareTag } from "@/components/brand/share-card";

export const size = SHARE_SIZE;
export const contentType = "image/png";
export const alt = "Koul · Set the rules once. Koul does the rest.";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", background: "#000000", color: "#ffffff", padding: "56px 64px", fontFamily: "Grotesk" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <ShareMark />
          <div style={shareTag}>ON STELLAR</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 52, fontSize: 92, fontWeight: 800, letterSpacing: -4, lineHeight: 0.98 }}>
          <div>Set the rules once.</div>
          <div style={{ color: LIME }}>Koul does the rest.</div>
        </div>
        <div style={{ marginTop: 26, fontSize: 30, fontWeight: 600, color: "#9a9a9a" }}>Automate your DeFi position from your own wallet.</div>
        <div style={{ display: "flex", marginTop: "auto", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: "Mono", fontSize: 24 }}>
            <div style={{ display: "flex", background: "#1c1c1c", borderRadius: 999, padding: "12px 22px", color: "#e6e6e6" }}>IF SOL &lt; $150</div>
            <div style={{ color: LIME }}>→</div>
            <div style={{ display: "flex", background: LIME, color: INK, borderRadius: 999, padding: "12px 22px" }}>Buy SOL</div>
          </div>
          <SharePill>koul.me</SharePill>
        </div>
      </div>
    ),
    { ...size, fonts: await shareFonts() },
  );
}
