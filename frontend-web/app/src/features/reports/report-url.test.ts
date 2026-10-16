import { describe, expect, it } from "vitest";
import { reportPdfHref } from "./report-url";

describe("reportPdfHref", () => {
  it("encodes report period values as query parameters instead of interpolating DOM strings", () => {
    expect(reportPdfHref("home/id", "2026-05-01&admin=true", "2026-06-30#fragment")).toBe(
      "/api/bff/homes/home%2Fid/reports/energy.pdf?from=2026-05-01%26admin%3Dtrue&to=2026-06-30%23fragment",
    );
  });
});
