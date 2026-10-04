import { describe, expect, it } from "vitest";
import { createMockApi } from "./mock-api";
import { ApiError } from "@/lib/api/types";

const input = (start: string, end: string) => ({
  period_start: start,
  period_end: end,
  kwh: "100.00",
  amount_dop: "1500.00",
  days: 31,
  reading_previous: null,
  reading_current: null,
});

describe("createMockApi (solo tests)", () => {
  it("lista viviendas y facturas ordenadas por período descendente", async () => {
    const api = createMockApi();
    const [home] = await api.listHomes();
    const bills = await api.listBills(home.id);
    const starts = bills.map((b) => b.period_start);
    expect(starts).toEqual([...starts].sort().reverse());
  });

  it("el dashboard demo está marcado como demo", async () => {
    const api = createMockApi();
    const [home] = await api.listHomes();
    const dash = await api.getDashboard(home.id);
    expect(dash.data_status.is_demo).toBe(true);
  });

  it("crea, edita y elimina facturas manuales", async () => {
    const api = createMockApi();
    const [home] = await api.listHomes();

    const created = await api.createBill(home.id, input("2026-09-01", "2026-09-30"));
    expect(created.source).toBe("manual");

    const updated = await api.updateBill(home.id, created.id, {
      ...input("2026-09-01", "2026-09-30"),
      kwh: "150.00",
    });
    expect(updated.kwh).toBe("150.00");

    await api.deleteBill(home.id, created.id);
    await expect(api.getBill(home.id, created.id)).rejects.toMatchObject({ status: 404 });
  });

  it("rechaza períodos solapados con 409", async () => {
    const api = createMockApi();
    const [home] = await api.listHomes();
    const err = await api
      .createBill(home.id, input("2026-07-15", "2026-08-15"))
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(409);
  });

  it("responde 404 para una vivienda inexistente", async () => {
    await expect(
      createMockApi().listBills("99999999-9999-4999-8999-999999999999"),
    ).rejects.toMatchObject({ status: 404 });
  });
});
