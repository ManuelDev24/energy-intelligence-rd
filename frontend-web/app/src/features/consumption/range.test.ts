import { describe, expect, it } from "vitest";
import { investigateHref } from "@/features/anomalies/anomaly";
import { initialRangeFromParams } from "./range";

const params = (query: string) => new URLSearchParams(query);

describe("rango inicial desde la URL (ERD-CHARTS-01)", () => {
  it("acepta un rango válido con granularidad", () => {
    expect(initialRangeFromParams(params("from=2026-09-21&to=2026-10-04&granularity=day"))).toEqual({ from: "2026-09-21", to: "2026-10-04", granularity: "day" });
    expect(initialRangeFromParams(params("from=2026-01-01&to=2026-12-31&granularity=month"))?.granularity).toBe("month");
  });
  it.each([
    ["", "sin parámetros"],
    ["from=2026-09-21&to=2026-10-04", "sin granularidad"],
    ["from=2026-09-21&to=2026-10-04&granularity=hour", "granularidad desconocida"],
    ["from=2026-10-04&to=2026-09-21&granularity=day", "desde posterior a hasta"],
    ["from=2024-01-01&to=2026-10-04&granularity=day", "más de 366 días"],
    ["from=2026-02-30&to=2026-03-04&granularity=day", "fecha inexistente"],
    ["from=2026-09-21&from=2026-09-22&to=2026-10-04&granularity=day", "parámetro repetido"],
    ["from=javascript:alert(1)&to=2026-10-04&granularity=day", "texto que no es fecha"],
  ])("rechaza %s (%s) sin adivinar", (query) => {
    expect(initialRangeFromParams(params(query))).toBeNull();
  });
});

describe("enlace para investigar una desviación", () => {
  it("un día anómalo abre las dos semanas que terminan ese día", () => {
    expect(investigateHref({ granularity: "day", period_start: "2026-10-04", period_end: "2026-10-04" }))
      .toBe("/consumption?from=2026-09-21&to=2026-10-04&granularity=day");
  });
  it("un mes anómalo se desglosa por días", () => {
    expect(investigateHref({ granularity: "month", period_start: "2026-09-01", period_end: "2026-09-30" }))
      .toBe("/consumption?from=2026-09-01&to=2026-09-30&granularity=day");
  });
  it("el enlace que produce siempre lo acepta la página", () => {
    const href = investigateHref({ granularity: "day", period_start: "2026-03-01", period_end: "2026-03-01" });
    expect(initialRangeFromParams(new URL(href, "http://x").searchParams)).not.toBeNull();
  });
});
