/** @type {import('next').NextConfig} */
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  outputFileTracingRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."),
};

export default nextConfig;
