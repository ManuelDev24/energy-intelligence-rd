import { expect, it, vi } from "vitest";
import { retryPolicy } from "@energyrd/api-client";
import { accountRequest, bffFetch, invalidateAccountRequests } from "./client";
it("routes the shared API through the BFF without browser credentials", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("[]"));
  await bffFetch("/api/v1/homes?limit=100&offset=0", { headers: { Authorization: "bad" } });
  expect(fetcher.mock.calls[0][0]).toBe("/api/bff/homes?limit=100&offset=0");
  expect(new Headers(fetcher.mock.calls[0][1]?.headers).has("authorization")).toBe(false);
  expect(fetcher.mock.calls[0][1]?.credentials).toBe("same-origin");
  fetcher.mockRestore();
});
it("rejects absolute URLs and discards pending responses after an account switch", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch");
  await expect(bffFetch("https://evil.test/api/v1/homes")).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
  let resolve!: (value: Response) => void;
  fetcher.mockImplementation(() => new Promise(done => { resolve = done; }));
  const pending = bffFetch("/api/v1/homes");
  invalidateAccountRequests();
  resolve(new Response("[]"));
  await expect(pending).rejects.toThrow();
  fetcher.mockRestore();
});
it("never surfaces raw non-JSON error bodies (e.g. proxy HTML) from auth endpoints", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<html>Traceback: secret internals</html>", { status: 502 }));
  const error = await accountRequest("login", { email: "a@b.test", password: "long-password" }).then(() => ({ message: "", status: 200 }), (cause: unknown) => cause as { message: string; status?: number });
  expect(error.message).not.toMatch(/html|Traceback|secret/);
  expect(error.status).toBe(502);
  fetcher.mockRestore();
});
it("rejects a previous-account body read after an account switch with a non-retryable error", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify([{ id: "previous-account-home" }])));
  const response = await bffFetch("/api/v1/homes");
  invalidateAccountRequests();
  const error = await response.json().then(() => null, (cause: unknown) => cause);
  expect(error).toMatchObject({ code: "account_changed" });
  expect(retryPolicy(0, error)).toBe(false);
  fetcher.mockRestore();
});
it("obtains the per-browser auth epoch with exactly one local retry, never more", async () => {
  const epoch = () => new Response(JSON.stringify({ detail: "Activa las cookies.", code: "auth_epoch_required" }), { status: 428 });
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(epoch()).mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
  await expect(accountRequest("login", { email: "a@b.test", password: "long-password" })).resolves.toBeUndefined();
  expect(fetcher).toHaveBeenCalledTimes(2);
  fetcher.mockReset(); fetcher.mockResolvedValue(epoch());
  await expect(accountRequest("register", { email: "a@b.test", password: "long-password", acceptTerms: true })).rejects.toMatchObject({ status: 428 });
  expect(fetcher).toHaveBeenCalledTimes(2);
  fetcher.mockRestore();
});
it("sends accept_terms: true on register and rejects locally without a network call when not accepted", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true })));
  await accountRequest("register", { email: " Alice@Example.COM ", password: "long-password", acceptTerms: true });
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({ email: "alice@example.com", password: "long-password", accept_terms: true });
  fetcher.mockClear();
  await expect(accountRequest("register", { email: "a@b.test", password: "long-password", acceptTerms: false })).rejects.toMatchObject({ status: 422, fieldErrors: { accept_terms: expect.any(String) } });
  expect(fetcher).not.toHaveBeenCalled();
  fetcher.mockRestore();
});
it("fetches draft legal versions and rejects a malformed or non-draft response", async () => {
  const legal = { terms_version: "2026-10-draft", privacy_version: "2026-10-draft", status: "draft" };
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify(legal)));
  const { fetchLegal } = await import("./client");
  await expect(fetchLegal()).resolves.toEqual(legal);
  expect(fetcher.mock.calls[0][0]).toBe("/api/bff/legal");
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ ...legal, status: "final" })));
  await expect(fetchLegal()).rejects.toBeInstanceOf(Error);
  fetcher.mockRestore();
});
it("deletes the account with the password and treats 204 as success without parsing a body", async () => {
  const { deleteAccountRequest } = await import("./client");
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status: 204 }));
  await expect(deleteAccountRequest("correct-horse-battery")).resolves.toBeUndefined();
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({ password: "correct-horse-battery" });
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ detail: "La contraseña no es correcta." }), { status: 403 }));
  await expect(deleteAccountRequest("wrong-password-here")).rejects.toMatchObject({ status: 403, message: "La contraseña no es correcta." });
  fetcher.mockRestore();
});
