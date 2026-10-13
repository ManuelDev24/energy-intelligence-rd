import { describe, expect, it, vi } from "vitest";
import { ApiError, ContractError, buildRegisterPayload, createApiClient } from "./index";

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const PASSWORD = "valid-test-password-123";

describe("ERD-AUTH-03 account deletion", () => {
  it("sends DELETE /auth/me with only the password and resolves on 204", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await expect(createApiClient("http://api.test/", fetcher).deleteAccount(PASSWORD)).resolves.toBeUndefined();
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("http://api.test/api/v1/auth/me");
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(init.body)).toEqual({ password: PASSWORD });
  });
  it("validates the password locally and never sends an invalid request", async () => {
    const fetcher = vi.fn();
    const client = createApiClient("http://api.test", fetcher);
    for (const bad of ["short", "x".repeat(129)]) {
      await expect(client.deleteAccount(bad)).rejects.toMatchObject({ status: 422, fieldErrors: { password: expect.any(String) } });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("surfaces the ownership transfer conflict code and wrong-password 403", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ detail: "x", code: "ownership_transfer_required", request_id: "r1" }, 409))
      .mockResolvedValueOnce(json({ detail: "Credenciales inválidas", code: "reauthentication_failed" }, 403));
    const client = createApiClient("http://api.test", fetcher);
    await expect(client.deleteAccount(PASSWORD)).rejects.toMatchObject({ status: 409, code: "ownership_transfer_required" });
    const wrong = await client.deleteAccount(PASSWORD).catch(e => e);
    expect(wrong).toBeInstanceOf(ApiError);
    expect(wrong).toMatchObject({ status: 403, code: "reauthentication_failed" });
  });
  it("treats a body on success as contract drift (deletion must be 204)", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ deleted: true }));
    await expect(createApiClient("http://api.test", fetcher).deleteAccount(PASSWORD)).rejects.toBeInstanceOf(ContractError);
  });
});

describe("ERD-AUTH-03 legal versions", () => {
  const legal = { terms_version: "2026-10-draft", privacy_version: "2026-10-draft", status: "draft" };
  it("loads public legal versions", async () => {
    const fetcher = vi.fn().mockResolvedValue(json(legal));
    expect(await createApiClient("http://api.test", fetcher).getLegal()).toEqual(legal);
    expect(fetcher.mock.calls[0][0]).toBe("http://api.test/api/v1/legal");
    expect(fetcher.mock.calls[0][1].method).toBeUndefined();
  });
  it("rejects a non-draft or incomplete legal payload", async () => {
    for (const bad of [{ ...legal, status: "final" }, { terms_version: "x", status: "draft" }]) {
      const fetcher = vi.fn().mockResolvedValue(json(bad));
      await expect(createApiClient("http://api.test", fetcher).getLegal()).rejects.toBeInstanceOf(ContractError);
    }
  });
});

describe("ERD-AUTH-03 register payload", () => {
  it("always sends accept_terms: true and never a client-chosen terms version", () => {
    const body = buildRegisterPayload({ email: " Alice@Example.COM ", password: PASSWORD, acceptTerms: true });
    expect(body).toEqual({ email: "alice@example.com", password: PASSWORD, accept_terms: true });
    expect(Object.keys(body)).not.toContain("terms_version");
  });
  it("refuses to build a registration without explicit acceptance", () => {
    for (const acceptTerms of [false, undefined, "true" as unknown as boolean]) {
      expect(() => buildRegisterPayload({ email: "a@b.test", password: PASSWORD, acceptTerms }))
        .toThrow(expect.objectContaining({ status: 422, fieldErrors: { accept_terms: expect.any(String) } }));
    }
  });
  it("keeps the password exact (no trimming) and enforces its bounds", () => {
    expect(buildRegisterPayload({ email: "a@b.test", password: ` ${PASSWORD} `, acceptTerms: true }).password).toBe(` ${PASSWORD} `);
    expect(() => buildRegisterPayload({ email: "a@b.test", password: "short", acceptTerms: true }))
      .toThrow(expect.objectContaining({ fieldErrors: { password: expect.any(String) } }));
  });
});

describe("ERD-AUTH-05 password recovery", () => {
  const TOKEN = "A".repeat(43);
  it("forgotPassword posts only the normalized email and resolves on 202", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ status: "accepted" }, 202));
    await expect(createApiClient("http://api.test", fetcher).forgotPassword(" Alice@Example.COM ")).resolves.toBeUndefined();
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("http://api.test/api/v1/auth/password/forgot");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ email: "alice@example.com" });
  });
  it("forgotPassword rejects an invalid email locally", async () => {
    const fetcher = vi.fn();
    await expect(createApiClient("http://api.test", fetcher).forgotPassword("nope"))
      .rejects.toMatchObject({ status: 422, fieldErrors: { email: expect.any(String) } });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("forgotPassword treats any status other than 202 as contract drift", async () => {
    for (const response of [json({ status: "accepted" }, 200), new Response(null, { status: 204 }), json({ status: "sent" }, 202)]) {
      const fetcher = vi.fn().mockResolvedValue(response);
      await expect(createApiClient("http://api.test", fetcher).forgotPassword("a@b.test")).rejects.toBeInstanceOf(ContractError);
    }
  });
  it("forgotPassword surfaces rate limiting", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ detail: "x", code: "auth_rate_limited" }, 429));
    await expect(createApiClient("http://api.test", fetcher).forgotPassword("a@b.test"))
      .rejects.toMatchObject({ status: 429, code: "auth_rate_limited" });
  });
  it("resetPassword sends the token in the body (never the URL) and resolves on 204", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await expect(createApiClient("http://api.test", fetcher).resetPassword(TOKEN, ` ${PASSWORD} `)).resolves.toBeUndefined();
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("http://api.test/api/v1/auth/password/reset");
    expect(url).not.toContain(TOKEN);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ token: TOKEN, new_password: ` ${PASSWORD} ` });
  });
  it("resetPassword validates token and password locally", async () => {
    const fetcher = vi.fn();
    const client = createApiClient("http://api.test", fetcher);
    await expect(client.resetPassword("short", PASSWORD)).rejects.toMatchObject({ status: 422, fieldErrors: { token: expect.any(String) } });
    await expect(client.resetPassword(TOKEN, "short")).rejects.toMatchObject({ status: 422, fieldErrors: { new_password: expect.any(String) } });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("resetPassword exposes reset_token_invalid and rejects a body on success", async () => {
    const invalid = vi.fn().mockResolvedValue(json({ detail: "x", code: "reset_token_invalid" }, 400));
    await expect(createApiClient("http://api.test", invalid).resetPassword(TOKEN, PASSWORD))
      .rejects.toMatchObject({ status: 400, code: "reset_token_invalid" });
    const drift = vi.fn().mockResolvedValue(json({ ok: true }));
    await expect(createApiClient("http://api.test", drift).resetPassword(TOKEN, PASSWORD)).rejects.toBeInstanceOf(ContractError);
  });
});
