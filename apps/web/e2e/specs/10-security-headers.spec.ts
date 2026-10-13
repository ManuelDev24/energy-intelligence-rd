// Auditoría C-06: cabeceras de seguridad reales de la web (CSP con nonce por petición, anti-iframe, nosniff) y que la CSP bloquea
// de verdad un script en línea inyectado. Las demás especificaciones fallan solas si la CSP rompe alguna pantalla (fixture cspWatch).
import { expect, test } from "../support/test";

test.describe("cabeceras de seguridad", () => {
  test("cada página lleva una CSP con nonce propio y las cabeceras anti-clickjacking y anti-sniffing", async ({ request }) => {
    const first = await request.get("/login");
    const second = await request.get("/login");
    const csp = first.headers()["content-security-policy"];
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    const nonce = (value: string) => /'nonce-([^']+)'/.exec(value)?.[1];
    expect(nonce(csp)).toBeTruthy();
    expect(nonce(csp)).not.toBe(nonce(second.headers()["content-security-policy"]));
    expect(first.headers()["x-frame-options"]).toBe("DENY");
    expect(first.headers()["x-content-type-options"]).toBe("nosniff");
    expect(first.headers()["permissions-policy"]).toContain("camera=()");
    expect(first.headers()["x-powered-by"]).toBeUndefined();
  });

  test("las páginas con token en el fragmento no envían Referer y no se guardan en caché", async ({ request }) => {
    for (const path of ["/restablecer-contrasena", "/invitacion"]) {
      const response = await request.get(path);
      expect(response.headers()["referrer-policy"], path).toBe("no-referrer");
      expect(response.headers()["cache-control"], path).toContain("no-store");
    }
  });

  test("el BFF (JSON) también trae nosniff y no se puede incrustar", async ({ request }) => {
    const response = await request.get("/api/bff/auth/me");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect(response.headers()["x-frame-options"]).toBe("DENY");
  });

  test.describe("inyección", () => {
    test.use({ cspGuard: false }); // aquí la violación es el objetivo de la prueba

    test("un script en línea inyectado en la página es bloqueado por el navegador", async ({ page }) => {
      await page.goto("/login");
      const outcome = await page.evaluate(() => new Promise<{ blocked: boolean; ran: boolean }>((resolve) => {
        let blocked = false;
        document.addEventListener("securitypolicyviolation", () => { blocked = true; }, { once: true });
        const script = document.createElement("script");
        script.textContent = "window.__injected = true";
        document.body.appendChild(script);
        setTimeout(() => resolve({ blocked, ran: (window as unknown as { __injected?: boolean }).__injected === true }), 300);
      }));
      expect(outcome).toEqual({ blocked: true, ran: false });
    });
  });
});
