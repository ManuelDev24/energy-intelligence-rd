import { expect, it, vi } from "vitest";
import { saveOnboardingHome, saveOnboardingContract, saveOnboardingGoal, readProfileHome, readProfileContract } from "./onboarding";
it("lee vivienda propia sin cuerpo y con caché HTTP deshabilitada", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(home)));
  expect((await readProfileHome(id)).id).toBe(id);
  expect(fetcher).toHaveBeenCalledWith(`/api/bff/homes/${id}`, expect.objectContaining({ method: "GET", cache: "no-store", body: undefined }));
  fetcher.mockRestore();
});
import { invalidateAccountRequests } from "./client";
const id = "11111111-1111-4111-8111-111111111111";
it("lee contrato por GET y rechaza contrato de otra vivienda", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ home_id: id, account_number: "ABC", updated_at: "2026-01-01T00:00:00Z" }))).mockResolvedValueOnce(new Response(JSON.stringify({ home_id: "22222222-2222-4222-8222-222222222222", account_number: "123", updated_at: "2026-01-01T00:00:00Z" })));
  expect((await readProfileContract(id)).account_number).toBe("ABC");
  await expect(readProfileContract(id)).rejects.toThrow();
  expect(fetcher.mock.calls[0][1]?.method).toBe("GET");
  fetcher.mockRestore();
});
it("descarta contrato cuando cambia la cuenta durante la lectura del cuerpo", async () => {
  const response = new Response("{}");
  response.text = async () => { invalidateAccountRequests(); return JSON.stringify({ home_id: id, account_number: "PRIVADO", updated_at: "2026-01-01T00:00:00Z" }); };
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
  await expect(readProfileContract(id)).rejects.toMatchObject({ code: "account_changed" });
  fetcher.mockRestore();
});
it("no consulta ids inválidos ni acepta respuesta de vivienda distinta", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ...home, id: "22222222-2222-4222-8222-222222222222" })));
  expect(() => readProfileHome("not-a-uuid")).toThrow();
  expect(fetcher).not.toHaveBeenCalled();
  await expect(readProfileHome(id)).rejects.toMatchObject({ code: "invalid_response" });
  fetcher.mockRestore();
});
const home = { id, code: null, name: "Casa", address: null, city: null, distributor: "EDESUR", created_at: "2026-01-01T00:00:00Z" };
it("crea vivienda con ubicación y distribuidora sin reclamar vivienda ajena", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(home), { status: 201 }));
  const result = await saveOnboardingHome(null, { name: "Casa", province: "Santiago", municipality: "Santiago", sector: "Centro", distributor: "EDESUR" });
  expect(result.id).toBe(id);
  expect(fetcher.mock.calls[0][0]).toBe("/api/bff/homes");
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({ name: "Casa", province: "Santiago", municipality: "Santiago", sector: "Centro", distributor: "EDESUR" });
  fetcher.mockRestore();
});
it("actualiza solo la vivienda seleccionada y descarta respuesta de cuenta cambiada", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async () => { invalidateAccountRequests(); return new Response(JSON.stringify(home)); });
  await expect(saveOnboardingHome(id, { occupants: 2, has_ac: false })).rejects.toMatchObject({ code: "account_changed" });
  expect(fetcher.mock.calls[0][0]).toBe(`/api/bff/homes/${id}`);
  expect(fetcher.mock.calls[0][1]?.method).toBe("PATCH");
  fetcher.mockRestore();
});
it("guarda contrato únicamente en vivienda UUID y valida respuesta home_id", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ home_id: "22222222-2222-4222-8222-222222222222", account_number: "XYZ", updated_at: "2026-01-01T00:00:00Z" })));
  await expect(saveOnboardingContract(id, "XYZ")).rejects.toThrow();
  expect(fetcher.mock.calls[0][0]).toBe(`/api/bff/homes/${id}/contract`);
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({ account_number: "XYZ" });
  fetcher.mockRestore();
});
it("guarda meta por endpoint existente, sin reintentar una escritura incierta", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("network"));
  await expect(saveOnboardingGoal(id, { monthly_kwh: "200", monthly_amount_rd: null })).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe(`/api/bff/homes/${id}/goal`);
  fetcher.mockRestore();
});
