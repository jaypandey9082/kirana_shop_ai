import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0B1F44", position: "relative" }}>
        <div style={{ color: "#FFFFFF", fontSize: 108, fontWeight: 800, lineHeight: 1, marginTop: -6 }}>K</div>
        <div style={{ position: "absolute", right: 36, bottom: 36, width: 26, height: 26, borderRadius: 13, background: "#00A7E1" }} />
      </div>
    ),
    size,
  );
}
