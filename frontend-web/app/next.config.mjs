/** @type {import('next').NextConfig} */
import path from "node:path";
import { fileURLToPath } from "node:url";

// The pilot default is strictly local; production builds/startup fail closed.
if (!["development", "test"].includes(process.env.NODE_ENV || "") && process.env.NEXT_PUBLIC_AUTH_ENABLED !== "true") {
  throw new Error("Production requires NEXT_PUBLIC_AUTH_ENABLED=true");
}
if (process.env.NEXT_PUBLIC_AUTH_ENABLED === "true") {
  for (const key of ["API_BASE_URL", "WEB_ORIGIN"]) {
    const value = process.env[key] || (process.env.NODE_ENV === "development" ? key === "API_BASE_URL" ? "http://localhost:8000" : "http://localhost:3000" : "");
    const url = new URL(value);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash || !["http:", "https:"].includes(url.protocol) || (process.env.NODE_ENV === "production" && url.protocol !== "https:")) throw new Error(`${key} must be a trusted, credential-free HTTPS origin in production`);
  }
}

const development = ["development", "test"].includes(process.env.NODE_ENV || "");
// Auditoría C-06: cabeceras estáticas (la CSP con nonce por petición la añade src/middleware.ts). Espejo de src/lib/security-headers.ts.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(development ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false, // no anunciar «X-Powered-By: Next.js»
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Paquete del monorepo en TypeScript (sin build propio).
  outputFileTracingRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."),
  transpilePackages: ["@energyrd/core", "@energyrd/api-contracts", "@energyrd/api-client"],
};

export default nextConfig;
