// @vitest-environment node
// Auditoría C-10: verificación de correo a través del BFF (canje público; reenvío con sesión).
import { describe, expect, it, vi } from "vitest";
import { handleBff } from "./bff";

const config = { enabled: true, apiBase: "http://127.0.0.1:8011", origin: "http://localhost:3000", secure: false };
const EPOCH = "0123456789abcdef0123456789abcdef";
const TOKEN = "B".repeat(40) + "_-9";
const req = (path: string, body: unknown, headers: Record<string, string> = {}) => new Request(`http://localhost:3000/api/bff/${path}`, {
  method: "POST", headers: { origin: config.origin, "content-type": "application/json", ...headers }, body: JSON.stringify(body),
});
const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("POST /auth/email/verify", () => {
  it("reenvía solo el token estricto, sin cookies ni Authorization, y devuelve 204 sin tocar cookies", async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const response = await handleBff(req("auth/email/verify", { token: TOKEN }, { cookie: `erd-epoch=${EPOCH}; erd-access=${EPOCH}~acc` }), config, upstream);
    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toBeNull();
    const [url, init] = upstream.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:8011/api/v1/auth/email/verify");
    expect(JSON.parse(init.body)).toEqual({ token: TOKEN });
    const sent = new Headers(init.headers);
    expect(sent.get("authorization")).toBeNull();
    expect(sent.get("cookie")).toBeNull();
  });

  it.each([[{}], [{ token: "corto" }], [{ token: TOKEN, extra: 1 }], [{ token: 5 }]])("rechaza %j antes de contactar a la API", async body => {
    const upstream = vi.fn();
    expect((await handleBff(req("auth/email/verify", body), config, upstream)).status).toBe(422);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("traduce el enlace inválido a un mensaje local sin reenviar el texto de la API", async () => {
    const upstream = vi.fn().mockResolvedValue(json({ detail: "TEXTO-INTERNO", code: "verification_token_invalid" }, 400));
    const response = await handleBff(req("auth/email/verify", { token: TOKEN }), config, upstream);
    expect(response.status).toBe(400);
    const text = JSON.stringify(await response.json());
    expect(text).toContain("verification_token_invalid");
    expect(text).not.toContain("TEXTO-INTERNO");
  });

  it("exige el mismo origen", async () => {
    const upstream = vi.fn();
    const request = req("auth/email/verify", { token: TOKEN }, { origin: "https://evil.example" });
    expect((await handleBff(request, config, upstream)).status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });
});

describe("POST /auth/email/verification (reenvío)", () => {
  const cookie = `erd-epoch=${EPOCH}; erd-access=${EPOCH}~access-token`;
  it("con sesión reenvía con bearer y valida la respuesta (202)", async () => {
    const upstream = vi.fn().mockResolvedValue(json({ status: "accepted" }, 202));
    const response = await handleBff(req("auth/email/verification", {}, { cookie }), config, upstream);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ status: "accepted" });
    expect(upstream.mock.calls[0][1].headers.Authorization).toBe("Bearer access-token");
  });
  it("sin sesión no consulta la API y un cuerpo con campos extra se rechaza", async () => {
    const upstream = vi.fn();
    expect((await handleBff(req("auth/email/verification", {}), config, upstream)).status).toBe(401);
    expect((await handleBff(req("auth/email/verification", { x: 1 }, { cookie }), config, upstream)).status).toBe(422);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("una respuesta fuera del contrato no se entrega", async () => {
    const upstream = vi.fn().mockResolvedValue(json({ status: "raro" }, 202));
    expect((await handleBff(req("auth/email/verification", {}, { cookie }), config, upstream)).status).toBeGreaterThanOrEqual(500);
  });
});
