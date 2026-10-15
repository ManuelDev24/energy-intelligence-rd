import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config.mjs";
import { buildCsp, staticSecurityHeaders } from "./security-headers";

const nonce = "abcdefghijklmnopqrstuv==";

describe("CSP de la web (auditoría C-06)", () => {
  it("producción: solo scripts con nonce, sin eval ni inline arbitrario, sin frames ni objetos", () => {
    const csp = buildCsp({ nonce, development: false });
    expect(csp).toContain(`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`);
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toMatch(/connect-src[^;]*(ws:|http:)/);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it("desarrollo: permite eval y HMR y el origen de la API local, y no fuerza https", () => {
    const csp = buildCsp({ nonce, development: true, apiOrigin: "http://localhost:8000/api" });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("connect-src 'self' http://localhost:8000 ws: wss:");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });

  it("autoriza solo el origen de ingesta de Sentry cuando hay DSN y descarta valores inválidos", () => {
    const withDsn = buildCsp({ nonce, development: false, sentryDsn: "https://publickey@o123.ingest.sentry.io/456" });
    expect(withDsn).toContain("connect-src 'self' https://o123.ingest.sentry.io;");
    expect(buildCsp({ nonce, development: false, sentryDsn: "javascript:alert(1)" })).toContain("connect-src 'self';");
    expect(buildCsp({ nonce, development: false, sentryDsn: "no es una url" })).toContain("connect-src 'self';");
  });

  it("rechaza un nonce vacío o con caracteres que romperían la cabecera", () => {
    for (const bad of ["", "corto", "abc def ghijklmnopqrs", "x'; script-src *; '1234567890"]) {
      expect(() => buildCsp({ nonce: bad, development: false })).toThrow("nonce");
    }
  });

  it("las cabeceras estáticas de next.config.mjs son las de security-headers.ts (sin deriva)", async () => {
    const [{ headers }] = await nextConfig.headers!();
    expect(headers).toEqual(staticSecurityHeaders(true)); // vitest corre con NODE_ENV=test: sin HSTS
    expect(staticSecurityHeaders(false).map(h => h.key)).toContain("Strict-Transport-Security");
    expect(staticSecurityHeaders(true).map(h => h.key)).not.toContain("Strict-Transport-Security");
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
