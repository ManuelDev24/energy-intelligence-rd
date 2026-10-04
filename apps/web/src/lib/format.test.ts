import { describe, expect, it } from "vitest";
import { formatDate, formatDop, formatMetric, formatNumber, formatPeriod } from "./format";

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

  it("conserva los 2 decimales que envía la API", () => {
    expect(formatNumber("410.00")).toBe("410.00");
    expect(formatNumber("13.55")).toBe("13.55");
    expect(formatMetric("420.00", "kWh")).toBe("420.00 kWh");
    expect(formatDop("5600.00")).toBe("RD$ 5,600.00");
  });

  it("añade 2 decimales a un entero, sin cambiar el valor", () => {
    expect(formatNumber("5600")).toBe("5,600.00");
  });

  it("no recorta decimales adicionales", () => {
    expect(formatNumber("13.5483")).toBe("13.5483");
  });

  it("solo añade separador de miles: quitándolo queda el valor de la API", () => {
    for (const raw of ["0.00", "420.00", "5600.00", "6553.33", "1234567.89"]) {
      expect(formatNumber(raw).replace(/,/g, "")).toBe(raw);
    }
  });

  it("devuelve el texto original si no es numérico", () => {
    expect(formatMetric("n/d", "kWh")).toBe("n/d kWh");
  });
});
