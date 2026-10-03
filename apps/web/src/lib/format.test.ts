import { describe, expect, it } from "vitest";
import { formatDate, formatDop, formatMetric, formatPeriod } from "./format";

describe("format", () => {
  it("formatea fechas ISO como DD/MM/AAAA", () => {
    expect(formatDate("2026-07-31")).toBe("31/07/2026");
  });

  it("deja intacto un valor que no es fecha ISO", () => {
    expect(formatDate("ayer")).toBe("ayer");
  });

  it("formatea períodos", () => {
    expect(formatPeriod("2026-07-01", "2026-07-31")).toBe("01/07/2026 – 31/07/2026");
  });

  it("formatea montos y métricas sin recalcularlos", () => {
    expect(formatDop("4550")).toContain("RD$");
    expect(formatMetric("410.00", "kWh")).toMatch(/^410 kWh$/);
  });

  it("devuelve el texto original si no es numérico", () => {
    expect(formatMetric("n/d", "kWh")).toBe("n/d kWh");
  });
});
