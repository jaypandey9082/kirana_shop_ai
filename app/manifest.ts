import type { MetadataRoute } from "next";

/** Installable merchant app (Add to Home Screen). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kirana Shop AI",
    short_name: "Kirana",
    description: "Counter, Shop, Khata and Salaahkaar for neighbourhood merchants.",
    start_url: "/counter",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F4F7FB",
    theme_color: "#0B1F44",
    lang: "en-IN",
    icons: [{ src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" }],
  };
}
