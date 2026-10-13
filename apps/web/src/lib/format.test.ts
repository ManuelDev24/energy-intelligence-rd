import { describe, expect, it } from "vitest";
import { formatDate, formatDop, formatMetric, formatNumber, formatPeriod } from "./format";

describe("format (convención común web/móvil)", () => {
  it("fechas como '1 ago 2026', sin desfase de zona horaria", () => {
    expect(formatDate("2026-07-31")).toBe("31 jul 2026");
  });

  it("deja intacto un valor que no es fecha ISO", () => {
    expect(formatDate("ayer")).toBe("ayer");
  });

  it("períodos compactos dentro del mismo mes", () => {
    expect(formatPeriod("2026-07-01", "2026-07-31")).toBe("1–31 jul 2026");
  });

  it("moneda siempre con prefijo RD$", () => {
    expect(formatDop("5600.00")).toBe("RD$ 5,600.00");
    expect(formatMetric("5600.00", "RD$")).toBe("RD$ 5,600.00");
  });

  it("kWh sin decimales inútiles; porcentaje pegado y con signo en deltas", () => {
    expect(formatMetric("420.00", "kWh")).toBe("420 kWh");
    expect(formatMetric("13.55", "kWh/día")).toBe("13.55 kWh/día");
    expect(formatMetric("50.00", "%", { signed: true })).toBe("+50.00%");
    expect(formatMetric("140.00", "kWh", { signed: true })).toBe("+140 kWh");
  });

  it("formatNumber conserva los dígitos de la API (solo añade miles)", () => {
    for (const raw of ["0.00", "420.00", "5600.00", "6553.33", "1234567.89", "13.5483"]) {
      expect(formatNumber(raw).replace(/,/g, "")).toBe(raw);
    }
    expect(formatNumber("5600")).toBe("5,600.00");
  });

  it("devuelve el texto original si no es numérico", () => {
    expect(formatMetric("n/d", "kWh")).toBe("n/d kWh");
  });
});
