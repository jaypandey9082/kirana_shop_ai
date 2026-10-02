import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

/**
 * Private LAN addresses of this machine (e.g. 192.168.x.x, 10.x.x.x), so a phone on the
 * same Wi-Fi can use the dev server. Detected at start-up because the venue network will
 * give a different address. Development only; production is unaffected.
 */
function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => i!.address)
    .filter((a) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a));
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  allowedDevOrigins: lanAddresses(),
};

export default nextConfig;
