import { describe, expect, it } from "vitest";
import { BillAssessmentSchema, BillItemsOutSchema, BillItemsReplaceSchema } from "./index";

const HOME = "6fcbbeb0-7447-497c-bb32-d91b813939f2";
const BILL = "7fcbbeb0-7447-497c-bb32-d91b813939f2";
const emptyDetail = { home_id: HOME, bill_id: BILL, items: [], items_total_dop: null, bill_amount_dop: "1768.09", difference_dop: null };

describe("bill detail contracts", () => {
  it("keeps an empty detail as null totals, never zero", () => {
    const parsed = BillItemsOutSchema.parse(emptyDetail);
    expect(parsed.items_total_dop).toBeNull();
    expect(parsed.difference_dop).toBeNull();
    expect(parsed.bill_amount_dop).toBe("1768.09");
  });

  it("accepts only charge/discount items and a bounded replace body", () => {
    const item = { label: "Cargo fijo", kind: "charge", amount_dop: "42.10" };
    expect(BillItemsReplaceSchema.safeParse({ items: [item] }).success).toBe(true);
    expect(BillItemsReplaceSchema.safeParse({ items: [{ ...item, kind: "tax" }] }).success).toBe(false);
    expect(BillItemsReplaceSchema.safeParse({ items: Array.from({ length: 101 }, () => item) }).success).toBe(false);
  });

  it("assessment is read-only with approval never performed", () => {
    const assessment = BillAssessmentSchema.parse({
      home_id: HOME, bill_id: BILL, status: "incomplete", checks: [], warnings: [],
      provenance: { origin: "migration", original_available: false, data: null, captured_at: null },
      corrections: [], corrections_has_more: false, detail: emptyDetail,
    });
    expect(assessment.read_only).toBe(true);
    expect(assessment.approval).toBe("not_performed");
    expect(BillAssessmentSchema.shape.approval.safeParse("approved").success).toBe(false);
    expect(BillAssessmentSchema.shape.provenance.shape.origin.safeParse("ocr").success).toBe(false);
  });
});
