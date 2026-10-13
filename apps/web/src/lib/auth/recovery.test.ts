// ERD-AUTH-05: cliente de recuperación (usa forgotPassword/resetPassword del api-client compartido).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@energyrd/api-client";
import { ACCOUNT_CHANGE_KEY, accountGeneration } from "./client";
import { parseResetToken, recoveryError, requestPasswordReset, resetPassword } from "./recovery";

const TOKEN = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ_-01234";
const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
beforeEach(() => { window.localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); });

describe("parseResetToken", () => {
  it("accepts exactly one 43-char base64url token in the fragment", () => {
    expect(TOKEN).toHaveLength(43);
    expect(parseResetToken(`#token=${TOKEN}`)).toBe(TOKEN);
  });
  it.each(["", "#", "#token=", `#token=${TOKEN.slice(1)}`, `#token=${TOKEN}A`, `#token=${TOKEN.slice(1)}+`, `#token=${TOKEN.slice(1)}=`, `#token=${TOKEN}&token=${TOKEN}`, `#tok=${TOKEN}`, `#token=${TOKEN.slice(0, 20)}%20${TOKEN.slice(21)}`])("rejects %s", hash => {
    expect(parseResetToken(hash)).toBeNull();
  });
});

describe("requestPasswordReset", () => {
  it("POSTs only the normalized email to the BFF route, same-origin, without referrer", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ status: "accepted" }, 202));
    await expect(requestPasswordReset("  A@B.test ")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/bff/auth/password/forgot");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ email: "a@b.test" });
    expect(init?.credentials).toBe("same-origin");
    expect(init?.redirect).toBe("error");
    expect(init?.referrerPolicy).toBe("no-referrer");
  });
  it("rejects a malformed email locally without network", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(requestPasswordReset("nope")).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("surfaces 429 as an ApiError", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ detail: "x" }, 429));
    await expect(requestPasswordReset("a@b.test")).rejects.toMatchObject({ status: 429 });
  });
});

describe("resetPassword", () => {
  it("sends the token only in the JSON body and, on 204, leaves account state unchanged", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    const before = accountGeneration();
    await expect(resetPassword(TOKEN, "nueva-contraseña-1")).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/bff/auth/password/reset");
    expect(String(url)).not.toContain(TOKEN);
    expect(JSON.parse(String(init?.body))).toEqual({ token: TOKEN, new_password: "nueva-contraseña-1" });
    expect(init?.referrerPolicy).toBe("no-referrer");
    expect(accountGeneration()).toBe(before);
    expect(window.localStorage.getItem(ACCOUNT_CHANGE_KEY)).toBeNull();
  });
  it("does not touch the session on failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ detail: "x", code: "reset_token_invalid" }, 400));
    const before = accountGeneration();
    await expect(resetPassword(TOKEN, "nueva-contraseña-1")).rejects.toMatchObject({ status: 400, code: "reset_token_invalid" });
    expect(accountGeneration()).toBe(before);
    expect(window.localStorage.getItem(ACCOUNT_CHANGE_KEY)).toBeNull();
  });
  it("rejects a malformed token locally without network", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(resetPassword("short", "nueva-contraseña-1")).rejects.toMatchObject({ status: 422 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("recoveryError (only status/code/field name, never upstream text)", () => {
  it.each([
    [new ApiError(400, "upstream secret", {}, "reset_token_invalid"), "invalid_link"],
    [new ApiError(422, "upstream secret", { token: "x" }, "validation_error"), "invalid_link"],
    [new ApiError(422, "upstream secret", { new_password: "x" }, "validation_error"), "password"],
    [new ApiError(422, "upstream secret", { email: "x" }, "validation_error"), "email"],
    [new ApiError(429, "upstream secret"), "rate_limited"],
    [new ApiError(0, "upstream secret"), "network"],
    [new ApiError(502, "upstream secret"), "generic"],
    [new ApiError(400, "upstream secret", {}, "other"), "generic"],
    [new Error("boom"), "generic"],
  ] as const)("%s -> %s", (error, kind) => {
    const result = recoveryError(error);
    expect(result.kind).toBe(kind);
    expect(result.message).not.toContain("upstream secret");
    expect(result.message.length).toBeGreaterThan(0);
  });
});
