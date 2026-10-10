import { ImageResponse } from "next/og";

export const alt = "Depth: Private perps. Shared depth.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#0b0b0b",
        color: "#f0ede5",
        padding: "60px 72px",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", fontSize: 38, letterSpacing: -2 }}>
        depth
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          fontSize: 76,
          letterSpacing: -4,
          lineHeight: 1.08,
        }}
      >
        <span>Private perps.</span>
        <span style={{ color: "#c9c8c0" }}>Shared depth.</span>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 20,
          color: "#a6a59e",
          borderTop: "1px solid #31312d",
          paddingTop: 24,
        }}
      >
        <span>Confidential perps infrastructure on Solana</span>
        <div style={{ width: 12, height: 12, background: "#ed864a" }} />
      </div>
    </div>,
    size,
  );
}
