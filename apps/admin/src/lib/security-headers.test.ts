import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config.mjs";
import { buildCsp as buildWebCsp, staticSecurityHeaders as webStatic } from "../../../web/src/lib/security-headers";
import { buildCsp, staticSecurityHeaders } from "./security-headers";

const nonce = "abcdefghijklmnopqrstuv==";

describe("CSP de la consola de administración (re-auditoría N-1)", () => {
  it("producción: solo scripts con nonce, sin eval, sin frames ni objetos, solo mismo origen", () => {
    const csp = buildCsp({ nonce, development: false });
    expect(csp).toContain(`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`);
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).toContain("connect-src 'self';");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });
  it("desarrollo permite eval y HMR y no fuerza https", () => {
    const csp = buildCsp({ nonce, development: true });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("ws: wss:");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });
  it("rechaza un nonce que rompería la cabecera", () => {
    for (const bad of ["", "corto", "x'; script-src *; '1234567890"]) expect(() => buildCsp({ nonce: bad, development: false })).toThrow("nonce");
  });
  it("las cabeceras de next.config.mjs son las de security-headers.ts (sin deriva) y no se anuncia el framework", async () => {
    const [{ headers }] = await nextConfig.headers!();
    expect(headers).toEqual(staticSecurityHeaders(true)); // vitest corre con NODE_ENV=test: sin HSTS
    expect(staticSecurityHeaders(false).map(h => h.key)).toContain("Strict-Transport-Security");
    expect(nextConfig.poweredByHeader).toBe(false);
  });
  it("no es más laxa que la de la web en ninguna directiva (sin deriva entre las dos apps)", () => {
    for (const development of [false, true]) {
      const parse = (csp: string) => Object.fromEntries(csp.split("; ").map(d => [d.split(" ")[0], d.split(" ").slice(1)]));
      const web = parse(buildWebCsp({ nonce, development })), admin = parse(buildCsp({ nonce, development }));
      for (const [name, values] of Object.entries(admin)) {
        for (const value of values) expect(web[name] ?? [], `${name} ${value}`).toContain(value);
      }
    }
    const webKeys = webStatic(false).map(h => h.key);
    for (const { key } of staticSecurityHeaders(false)) if (key !== "Cross-Origin-Resource-Policy") expect(webKeys).toContain(key);
  });
});
