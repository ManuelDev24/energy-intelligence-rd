/** @type {import('next').NextConfig} */
import path from "node:path";
import { fileURLToPath } from "node:url";

// Mismas cabeceras estáticas que src/lib/security-headers.ts (una prueba vigila que no se desvíen). Se repiten aquí porque este archivo
// es JavaScript puro y se evalúa antes de compilar el código fuente.
const development = process.env.NODE_ENV !== "production";
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  ...(development ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

// Same fail-closed rule as apps/web: no production boot without an explicit, trusted API origin.
if (process.env.NODE_ENV === "production") {
  const value = process.env.ADMIN_API_BASE_URL || "";
  const url = new URL(value || "http://invalid");
  if (!value || url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("ADMIN_API_BASE_URL must be an explicit, credential-free HTTPS origin in production");
  }
  const adminOrigin = process.env.ADMIN_ORIGIN || "";
  const origin = new URL(adminOrigin || "http://invalid");
  if (!adminOrigin || origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("ADMIN_ORIGIN must be an explicit, credential-free HTTPS origin in production");
  }
}

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  outputFileTracingRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."),
};

export default nextConfig;
