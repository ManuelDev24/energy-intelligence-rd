import { expect, it, vi } from "vitest";
import { createOwnedHome } from "./homes";
import { invalidateAccountRequests } from "./client";
it("creates a home without accepting any pilot id or owner claim", async () => {
  const home = { id: "11111111-1111-4111-8111-111111111111", code: null, name: "Casa", address: null, city: null, distributor: "EDESUR", created_at: "2026-01-01T00:00:00Z" };
  const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(home), { status: 201 }));
  expect(await createOwnedHome("Casa", "EDESUR")).toEqual({ ...home, province: null, municipality: null, sector: null, user_type: null, occupants: null, has_ac: null, has_water_heater: null, has_pool: null, has_solar: null, has_inverter: null });
  expect(upstream.mock.calls[0][0]).toBe("/api/bff/homes");
  expect(JSON.parse(String(upstream.mock.calls[0][1]?.body))).toEqual({ name: "Casa", distributor: "EDESUR" });
  upstream.mockRestore();
});
it("does not retry a mutation on an ambiguous network failure", async () => {
  const upstream = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("network"));
  await expect(createOwnedHome("Casa", "EDESUR")).rejects.toThrow();
  expect(upstream).toHaveBeenCalledTimes(1); upstream.mockRestore();
});
it("rejects a previous-account home when the account changes while the body is being read", async () => {
  const home = { id: "11111111-1111-4111-8111-111111111111", code: null, name: "Casa", address: null, city: null, distributor: "EDESUR", created_at: "2026-01-01T00:00:00Z" };
  let push!: () => void;
  const body = new ReadableStream<Uint8Array>({ start(controller) { push = () => { controller.enqueue(new TextEncoder().encode(JSON.stringify(home))); controller.close(); }; } });
  const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(body, { status: 201 }));
  const pending = createOwnedHome("Casa", "EDESUR").then(() => null, (cause: unknown) => cause);
  await new Promise(done => setTimeout(done, 0)); // headers already accepted for the old account
  invalidateAccountRequests();
  push();
  expect(await pending).toMatchObject({ code: "account_changed" });
  upstream.mockRestore();
});
