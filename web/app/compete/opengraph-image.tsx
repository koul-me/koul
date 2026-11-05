/** The competition's share card, used by its pages unless they set their own. Rendered at build time. */
import { ImageResponse } from "next/og";
import { INK, LIME, SHARE_SIZE, ShareMark, SharePill, shareFonts, shareTag } from "@/components/brand/share-card";

export const size = SHARE_SIZE;
export const contentType = "image/png";
export const alt = "Koul autopilot trading competition · $300 pool, free to enter";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ height: "100%", width: "100%", display: "flex", background: "#000000", color: "#ffffff", fontFamily: "Grotesk" }}>
        <div style={{ position: "relative", display: "flex", flexDirection: "column", justifyContent: "space-between", width: 400, height: "100%", background: LIME, color: INK, padding: "56px 48px", overflow: "hidden" }}>
          <div style={{ position: "absolute", right: -110, top: -110, width: 300, height: 300, borderRadius: 999, border: "50px solid rgba(10,15,0,0.08)" }} />
          <div style={{ fontFamily: "Mono", fontSize: 20, letterSpacing: 3 }}>PRIZE POOL</div>
          <div style={{ fontSize: 132, fontWeight: 800, letterSpacing: -7, lineHeight: 0.9 }}>$300</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "56px 56px 56px 60px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <ShareMark />
            <div style={shareTag}>STELLAR TESTNET</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 48, fontSize: 76, fontWeight: 800, letterSpacing: -3, lineHeight: 0.98 }}>
            <div>You set the rules.</div>
            <div style={{ color: LIME }}>It trades.</div>
          </div>
          <div style={{ marginTop: 22, fontSize: 28, fontWeight: 600, color: "#9a9a9a" }}>Autopilot trading competition</div>
          <div style={{ display: "flex", marginTop: "auto", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 24, fontWeight: 600, color: "#e6e6e6" }}>Free to enter</div>
            <SharePill>koul.me/compete</SharePill>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: await shareFonts() },
  );
}
