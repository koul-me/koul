/** The home-screen icon: the Orbit mark on black, 180 px. */
import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#000000" }}>
        <svg width="124" height="124" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="21" fill="none" stroke="#ffffff" strokeWidth="10" />
          <circle cx="46.8" cy="17.2" r="12.5" fill="#000000" />
          <circle cx="46.8" cy="17.2" r="10" fill="#c8f23a" />
        </svg>
      </div>
    ),
    size,
  );
}
