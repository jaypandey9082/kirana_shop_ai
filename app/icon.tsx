import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

/** App icon: navy tile, white "K", sky dot (matches the design tokens). */
export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0B1F44", borderRadius: 112, position: "relative" }}>
        <div style={{ color: "#FFFFFF", fontSize: 300, fontWeight: 800, lineHeight: 1, marginTop: -16 }}>K</div>
        <div style={{ position: "absolute", right: 104, bottom: 104, width: 72, height: 72, borderRadius: 36, background: "#00A7E1" }} />
      </div>
    ),
    size,
  );
}
