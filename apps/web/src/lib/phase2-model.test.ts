import { describe, expect, it } from "vitest";
import { ApiError, ContractError } from "@energyrd/api-client";
import { presetRange, validateRange, bucketLabel, groupGaps } from "@/features/consumption/range";
import { validateReadingForm, neighbours } from "@/features/readings/form";
import { validateGoalForm, goalToForm } from "@/features/goal/form";
import { userMessage } from "@/lib/api/errors";
import { addDaysIso, formatReadAt, inclusiveDays, localToIso, todayRD } from "@/lib/rd-time";
import type { Reading } from "@/lib/api/schemas";

const HOME = "11111111-1111-4111-8111-111111111111";
const reading = (id: number, read_at: string, reading_kwh: string): Reading => ({
  id: `33333333-3333-4333-8333-${String(id).padStart(12, "0")}`, home_id: HOME, read_at, reading_kwh, source: "manual", note: null, created_at: read_at,
});
// 2026-10-04 13:00 en Santo Domingo (UTC−4) = 17:00 UTC.
const NOW = new Date("2026-10-04T17:00:00Z");

describe("hora de República Dominicana (UTC−4 fijo)", () => {
  it("hoy en RD no depende de la zona del navegador", () => {
    expect(todayRD(new Date("2026-10-05T03:30:00Z"))).toBe("2026-10-04"); // 23:30 en RD
    expect(todayRD(new Date("2026-10-05T04:00:00Z"))).toBe("2026-10-05");
  });
  it("fecha+hora local → ISO con -04:00, y de vuelta para mostrar", () => {
    expect(localToIso("2026-10-03", "20:00")).toBe("2026-10-03T20:00:00-04:00");
    expect(formatReadAt("2026-10-04T00:00:00Z")).toBe("3 oct 2026, 20:00");
  });
  it("días inclusivos y suma de días", () => {
    expect(inclusiveDays("2026-10-01", "2026-10-01")).toBe(1);
    expect(inclusiveDays("2025-10-04", "2026-10-04")).toBe(366);
    expect(addDaysIso("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("rangos de consumo", () => {
  it("presets: 7 y 30 días por día, 12 meses por mes desde el día 1", () => {
    expect(presetRange("7d", "2026-10-04")).toEqual({ from: "2026-09-28", to: "2026-10-04", granularity: "day" });
    expect(presetRange("30d", "2026-10-04")).toEqual({ from: "2026-09-05", to: "2026-10-04", granularity: "day" });
    expect(presetRange("12m", "2026-10-04")).toEqual({ from: "2025-11-01", to: "2026-10-04", granularity: "month" });
  });
  it("valida rango personalizado: fechas, orden y máximo 366 días", () => {
    expect(validateRange("2025-10-04", "2026-10-04")).toBeNull();
    expect(validateRange("2025-10-03", "2026-10-04")).toBe("El rango no puede superar 366 días.");
    expect(validateRange("2026-10-05", "2026-10-04")).toBe("La fecha inicial debe ser igual o anterior a la final.");
    expect(validateRange("", "2026-10-04")).toBe("Elige las dos fechas del rango.");
    expect(validateRange("2026-02-30", "2026-10-04")).toBe("Elige las dos fechas del rango.");
  });
  it("etiquetas de bucket según la granularidad", () => {
    expect(bucketLabel({ start: "2026-10-04", end: "2026-10-04" }, "day")).toBe("4 oct");
    expect(bucketLabel({ start: "2026-09-28", end: "2026-10-04" }, "week")).toBe("28 sep – 4 oct");
    expect(bucketLabel({ start: "2026-10-01", end: "2026-10-31" }, "month")).toBe("oct 2026");
  });
});

describe("huecos (buckets sin datos)", () => {
  const b = (start: string, kwh: string | null, reason: string | null = kwh === null ? "Sin lecturas" : null) => ({ start, end: start, kwh, reason });
  it("agrupa días seguidos sin datos y respeta el motivo", () => {
    const gaps = groupGaps([b("2026-09-01", null), b("2026-09-02", null), b("2026-09-03", "1.00"), b("2026-09-04", null), b("2026-09-05", null, "Otro")], "day");
    expect(gaps).toEqual([
      { key: "2026-09-01", label: "1 sep – 2 sep", count: 2, reason: "Sin lecturas" },
      { key: "2026-09-04", label: "4 sep", count: 1, reason: "Sin lecturas" },
      { key: "2026-09-05", label: "5 sep", count: 1, reason: "Otro" },
    ]);
  });
  it("un 0 real no es un hueco", () => {
    expect(groupGaps([b("2026-09-01", "0.00")], "day")).toEqual([]);
  });
});

describe("formulario de lectura (espejo de la API)", () => {
  const readings = [reading(1, "2026-09-20T12:00:00Z", "1000.00"), reading(2, "2026-09-27T12:00:00Z", "1070.50")];
  const base = { date: "2026-09-25", time: "08:00", reading_kwh: "1050", note: "" };
  it("acepta una lectura válida y la convierte a ISO con -04:00", () => {
    expect(validateReadingForm(base, readings, NOW)).toEqual({ ok: true, value: { read_at: "2026-09-25T08:00:00-04:00", reading_kwh: "1050", note: null } });
  });
  it("rechaza negativos, texto y más de 2 decimales", () => {
    for (const reading_kwh of ["-1", "abc", "1.234", ""]) {
      const result = validateReadingForm({ ...base, reading_kwh }, [], NOW);
      expect(result.ok).toBe(false);
    }
    const negative = validateReadingForm({ ...base, reading_kwh: "-1" }, [], NOW);
    expect(!negative.ok && negative.errors.reading_kwh).toBe("La lectura no puede ser negativa.");
  });
  it("rechaza fecha/hora en el futuro (con 5 min de tolerancia como la API)", () => {
    const future = validateReadingForm({ ...base, date: "2026-10-04", time: "13:10" }, [], NOW);
    expect(!future.ok && future.errors.date).toBe("La lectura no puede estar en el futuro.");
    expect(validateReadingForm({ ...base, date: "2026-10-04", time: "13:04" }, [], NOW).ok).toBe(true);
  });
  it("monotonía: no menor que la anterior ni mayor que la siguiente; mismo instante = duplicada", () => {
    const low = validateReadingForm({ ...base, reading_kwh: "999" }, readings, NOW);
    expect(!low.ok && low.errors.reading_kwh).toMatch(/^Debe ser mayor o igual que la lectura anterior \(1,000\.00 kWh/);
    const high = validateReadingForm({ ...base, reading_kwh: "1080" }, readings, NOW);
    expect(!high.ok && high.errors.reading_kwh).toMatch(/^Debe ser menor o igual que la lectura siguiente \(1,070\.50 kWh/);
    const dup = validateReadingForm({ ...base, date: "2026-09-27", time: "08:00", reading_kwh: "1070.5" }, readings, NOW);
    expect(!dup.ok && dup.errors.date).toBe("Ya existe una lectura con esa fecha y hora.");
  });
  it("vecinas por tiempo (pista de monotonía)", () => {
    expect(neighbours(readings, "2026-09-25T08:00:00-04:00")).toEqual({ previous: readings[0], next: readings[1] });
    expect(neighbours(readings, "2026-10-01T08:00:00-04:00")).toEqual({ previous: readings[1], next: undefined });
  });
  it("nota opcional de hasta 255 caracteres", () => {
    expect(validateReadingForm({ ...base, note: "  Medidor del patio  " }, [], NOW)).toMatchObject({ ok: true, value: { note: "Medidor del patio" } });
    expect(validateReadingForm({ ...base, note: "x".repeat(256) }, [], NOW).ok).toBe(false);
  });
});

describe("formulario de meta", () => {
  it("al menos una meta, mayor que 0, con hasta 2 decimales; vacío = sin esa meta", () => {
    expect(validateGoalForm({ monthly_amount_rd: "3000", monthly_kwh: "" })).toEqual({ ok: true, value: { monthly_amount_rd: "3000", monthly_kwh: null } });
    const none = validateGoalForm({ monthly_amount_rd: "", monthly_kwh: " " });
    expect(!none.ok && none.errors.form).toBe("Define al menos una meta: en RD$, en kWh o ambas.");
    const zero = validateGoalForm({ monthly_amount_rd: "0", monthly_kwh: "1.234" });
    expect(!zero.ok && zero.errors).toEqual({ monthly_amount_rd: "Debe ser mayor que 0.", monthly_kwh: "Número con hasta 2 decimales." });
  });
  it("precarga desde la meta guardada sin inventar ceros", () => {
    expect(goalToForm(null)).toEqual({ monthly_amount_rd: "", monthly_kwh: "" });
    expect(goalToForm({ home_id: HOME, monthly_amount_rd: null, monthly_kwh: "400.00", updated_at: "2026-10-04T00:00:00Z" })).toEqual({ monthly_amount_rd: "", monthly_kwh: "400.00" });
  });
});

describe("mensajes de error locales (nunca el texto de la API)", () => {
  const leak = "psycopg2 La lectura (900) es menor que la anterior";
  it("por estado/código/campo y contexto", () => {
    expect(userMessage(new ApiError(409, leak, {}, "conflict"), "reading-create")).toBe("Ya existe una lectura con esa fecha y hora.");
    expect(userMessage(new ApiError(422, leak, {}, "invalid_input"), "reading-create")).toBe("La lectura no encaja con las demás: debe ser mayor o igual que la anterior y menor o igual que la siguiente. El cambio de medidor aún no está soportado.");
    expect(userMessage(new ApiError(422, leak, { read_at: leak }, "validation_error"), "reading-create")).toBe("Revisa la fecha y hora: la lectura no puede estar en el futuro.");
    expect(userMessage(new ApiError(404, leak), "reading-delete")).toBe("La lectura ya no existe. Actualiza la lista.");
    expect(userMessage(new ApiError(422, leak, {}, "invalid_input"), "consumption")).toBe("Rango de fechas inválido: máximo 366 días.");
    expect(userMessage(new ApiError(422, leak, {}, "validation_error"), "goal-save")).toBe("Revisa la meta: valores mayores que 0, con hasta 2 decimales, y al menos una meta.");
    expect(userMessage(new ApiError(0, leak), "load")).toBe("No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.");
    expect(userMessage(new ApiError(503, leak), "load")).toBe("Error del servidor. Inténtalo de nuevo más tarde.");
    expect(userMessage(new ContractError(), "load")).toBe("La respuesta del servidor no es válida. Inténtalo de nuevo.");
    expect(userMessage(new Error(leak), "load")).toBe("No se pudo completar la solicitud.");
  });
});
