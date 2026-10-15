import { describe, expect, it } from "vitest";
import { homeIdProblem, ocrLabel, qualityRows, share, sourceLabel, type BillsSummary } from "./bills";

const summary: BillsSummary = { days: 30, total: 8, recent: 3, homes_with_bills: 2, manual: 6, seed: 2, with_document: 2, with_readings: 4, with_due_date: 1, paid: 0, zero_kwh: 1, zero_amount: 0, ocr_pending: 0, ocr_failed: 1, ocr_done: 2 };

describe("bills quality rules", () => {
  it("needs the exact home id, never a fuzzy term", () => {
    expect(homeIdProblem("11111111-1111-4111-8111-111111111111")).toBeNull();
    expect(homeIdProblem(" 11111111-1111-4111-8111-111111111111 ")).toBeNull();
    for (const bad of ["", "PILOT-01", "11111111", "casa de maría", "%"]) expect(homeIdProblem(bad), bad).not.toBeNull();
  });
  it("does not invent a percentage when there are no bills", () => {
    expect(share(0, 0)).toBe("—");
    expect(share(2, 8)).toBe("25 %");
    expect(qualityRows({ ...summary, total: 0 }).every((r) => r.share === "—")).toBe(true);
  });
  it("lists completeness and capture-error rows with their share", () => {
    const rows = Object.fromEntries(qualityRows(summary).map((r) => [r.label, r.share]));
    expect(rows["Con original (foto o PDF)"]).toBe("25 %");
    expect(rows["Con lecturas del medidor"]).toBe("50 %");
    expect(rows["Con 0 kWh"]).toBe("13 %");
    expect(rows["Con monto 0"]).toBe("0 %");
  });
  it("labels OCR and source in Spanish and keeps unknown values visible", () => {
    expect(ocrLabel(null)).toBe("Sin OCR");
    expect(ocrLabel("failed")).toBe("Falló");
    expect(ocrLabel("raro")).toBe("raro");
    expect(sourceLabel("seed")).toBe("Dato de demostración");
  });
});
