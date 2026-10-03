import { describe, expect, it } from "vitest";
import { validateBillForm, type BillFormValues } from "./bill-form";

const valid: BillFormValues = {
  period_start: "2026-08-01",
  period_end: "2026-08-31",
  kwh: "410.5",
  amount_dop: "5480.00",
  days: "31",
  reading_previous: "",
  reading_current: "",
};

describe("validateBillForm", () => {
  it("acepta datos válidos y convierte vacíos opcionales en null", () => {
    const r = validateBillForm(valid);
    expect(r).toEqual({
      ok: true,
      value: {
        period_start: "2026-08-01",
        period_end: "2026-08-31",
        kwh: "410.5",
        amount_dop: "5480.00",
        days: 31,
        reading_previous: null,
        reading_current: null,
      },
    });
  });

  it("exige fechas", () => {
    const r = validateBillForm({ ...valid, period_start: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.period_start).toBeDefined();
  });

  it("rechaza fecha final anterior a la inicial", () => {
    const r = validateBillForm({ ...valid, period_end: "2026-07-01" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.period_end).toMatch(/posterior/);
  });

  it("rechaza montos negativos, no numéricos o con más de 2 decimales", () => {
    for (const bad of ["-1", "abc", "1.234", ""]) {
      expect(validateBillForm({ ...valid, kwh: bad }).ok).toBe(false);
    }
  });

  it("limita los días a 0–366", () => {
    expect(validateBillForm({ ...valid, days: "367" }).ok).toBe(false);
    expect(validateBillForm({ ...valid, days: "x" }).ok).toBe(false);
    expect(validateBillForm({ ...valid, days: "0" }).ok).toBe(true);
  });

  it("rechaza lectura actual menor que la anterior", () => {
    const r = validateBillForm({ ...valid, reading_previous: "500", reading_current: "400" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.reading_current).toBeDefined();
  });

  it("acepta lecturas coherentes", () => {
    const r = validateBillForm({ ...valid, reading_previous: "400", reading_current: "810.5" });
    expect(r.ok).toBe(true);
  });
});
