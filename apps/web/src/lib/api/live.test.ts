import { describe, expect, it, vi } from "vitest";
import { createLiveApi } from "./live";
import { ApiError } from "./types";

const HOME = "11111111-1111-4111-8111-111111111111";
const BILL = "aaaaaaaa-0000-4000-8000-000000000001";

const billJson = {
  id: BILL,
  home_id: HOME,
  period_start: "2026-07-01",
  period_end: "2026-07-31",
  kwh: "410.00",
  amount_dop: "5480.00",
  days: 31,
  reading_previous: null,
  reading_current: null,
  source: "manual",
  created_at: "2026-08-01T00:00:00Z",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("createLiveApi", () => {
  it("pide la lista de facturas bajo /api/v1 y valida con Zod", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json([billJson]));
    const api = createLiveApi("http://api.test/", fetchMock);

    const bills = await api.listBills(HOME);

    expect(fetchMock.mock.calls[0][0]).toBe(`http://api.test/api/v1/homes/${HOME}/bills`);
    expect(bills[0].kwh).toBe("410.00");
  });

  it("acepta decimales numéricos y los conserva como texto", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ ...billJson, kwh: 410.5, amount_dop: 5480 }));
    const bill = await createLiveApi("http://api.test", fetchMock).getBill(HOME, BILL);
    expect(bill.kwh).toBe("410.5");
    expect(bill.amount_dop).toBe("5480");
  });

  it("falla si la respuesta no cumple el contrato", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json([{ ...billJson, id: "no-uuid" }]));
    await expect(createLiveApi("http://api.test", fetchMock).listBills(HOME)).rejects.toThrow();
  });

  it("envía POST con source manual", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(billJson, 201));
    await createLiveApi("http://api.test", fetchMock).createBill(HOME, {
      period_start: "2026-07-01",
      period_end: "2026-07-31",
      kwh: "410.00",
      amount_dop: "5480.00",
      days: 31,
      reading_previous: null,
      reading_current: null,
    });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string).source).toBe("manual");
  });

  it("convierte errores de la API en ApiError con su detail", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ detail: "Período solapado" }, 409));
    const err = await createLiveApi("http://api.test", fetchMock)
      .getBill(HOME, BILL)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(409);
    expect((err as ApiError).message).toBe("Período solapado");
  });

  it("resume errores de validación 422 de FastAPI", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(json({ detail: [{ msg: "campo a" }, { msg: "campo b" }] }, 422));
    await expect(createLiveApi("http://api.test", fetchMock).listHomes()).rejects.toThrow(
      "campo a; campo b",
    );
  });

  it("reporta fallo de red como ApiError", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    await expect(createLiveApi("http://api.test", fetchMock).listHomes()).rejects.toMatchObject({
      status: 0,
    });
  });

  it("DELETE no intenta parsear cuerpo (204)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await expect(createLiveApi("http://api.test", fetchMock).deleteBill(HOME, BILL)).resolves.toBeUndefined();
  });
});
