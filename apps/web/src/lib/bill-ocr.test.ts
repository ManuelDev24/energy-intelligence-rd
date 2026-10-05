import { describe, expect, it } from "vitest";
import { ocrDraftToBillForm } from "./bill-ocr";

const field = (value: string | null, confidence: "high" | "inferred" | "none") => ({ value, confidence });

describe("OCR bill draft", () => {
  it("maps suggested values to editable bill fields and preserves empty readings", () => {
    expect(ocrDraftToBillForm({
      period_start: field("2026-01-01", "high"), period_end: field("2026-01-31", "inferred"),
      days: field("31", "high"), kwh: field("250", "high"), amount_dop: field("3200.50", "high"),
      reading_previous: field(null, "none"), reading_current: field("999", "inferred"),
      warnings: [], raw_text_excerpt: "",
    })).toEqual({ period_start: "2026-01-01", period_end: "2026-01-31", days: "31", kwh: "250", amount_dop: "3200.50", reading_previous: "", reading_current: "999" });
  });
});
