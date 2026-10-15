import { describe, expect, it } from "vitest";
import type { MyAccess } from "./access";
import { buildJobsQuery, canCancel, canRetry, EMPTY_FILTERS, formatBytes, PAGE_SIZE, reasonProblem } from "./ocr";

const access = (scopes: string[]): MyAccess => ({ user_id: "u", email: "a@example.com", roles: ["r"], scopes });
const params = (qs: string) => Object.fromEntries(new URLSearchParams(qs.slice(1)));

describe("consola OCR", () => {
  it("sin filtros solo pide la primera página", () => {
    expect(params(buildJobsQuery(EMPTY_FILTERS, 0))).toEqual({ limit: String(PAGE_SIZE), offset: "0" });
  });

  it("convierte días de RD (UTC−4) en un rango semiabierto que incluye el día final", () => {
    const qs = params(buildJobsQuery({ status: "dead_letter", errorCode: "engine_error", minAttempts: "2",
      from: "2026-10-01", to: "2026-10-13" }, 50));
    expect(qs).toEqual({ status: "dead_letter", error_code: "engine_error", min_attempts: "2",
      created_from: "2026-10-01T04:00:00.000Z", created_to: "2026-10-14T04:00:00.000Z",
      limit: String(PAGE_SIZE), offset: "50" });
  });

  it("descarta valores inválidos en vez de enviarlos", () => {
    const qs = params(buildJobsQuery({ ...EMPTY_FILTERS, minAttempts: "-1", from: "ayer", to: "2026-13-45" }, -5));
    expect(qs).toEqual({ limit: String(PAGE_SIZE), offset: "0" });
    expect(params(buildJobsQuery({ ...EMPTY_FILTERS, minAttempts: "101" }, 0)).min_attempts).toBeUndefined();
  });

  it("las acciones dependen del scope y del estado", () => {
    const retry = access(["admin.ocr.read", "admin.ocr.retry"]);
    const review = access(["admin.ocr.read", "admin.ocr.review"]);
    expect(canRetry({ status: "dead_letter" }, retry)).toBe(true);
    expect(canRetry({ status: "failed_retryable" }, retry)).toBe(true);
    expect(canRetry({ status: "failed_permanent" }, retry)).toBe(false);
    expect(canRetry({ status: "dead_letter" }, review)).toBe(false);
    expect(canCancel({ status: "queued" }, review)).toBe(true);
    expect(canCancel({ status: "processing" }, review)).toBe(true);
    expect(canCancel({ status: "completed" }, review)).toBe(false);
    expect(canCancel({ status: "queued" }, retry)).toBe(false);
    expect(canRetry({ status: "dead_letter" }, null)).toBe(false);
  });

  it("el motivo es obligatorio, de una línea y de 500 caracteres como máximo", () => {
    expect(reasonProblem("   ")).toBe("El motivo es obligatorio.");
    expect(reasonProblem("a".repeat(501))).toMatch(/500/);
    expect(reasonProblem("uno\ndos")).toMatch(/una sola línea/);
    expect(reasonProblem("Revisar motor")).toBeNull();
  });

  it("formatea tamaños", () => {
    expect(formatBytes(100)).toBe("100 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});
