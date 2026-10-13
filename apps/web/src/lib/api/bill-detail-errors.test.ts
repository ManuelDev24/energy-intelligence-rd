import { describe, expect, it } from "vitest";
import { ApiError } from "@energyrd/api-client";
import { billDetailUnavailable, userMessage } from "./errors";

describe("ERD-BILL-02: errores locales del detalle de factura", () => {
  it.each([404, 405, 501])("piloto sin el endpoint (%i) = no disponible", (status) => {
    expect(billDetailUnavailable(new ApiError(status, "SERVER-TEXT"), false)).toBe(true);
  });

  it("con cuenta, un 404 es un error real (no encontrado o sin acceso), no 'no disponible'", () => {
    expect(billDetailUnavailable(new ApiError(404, "x"), true)).toBe(false);
    expect(billDetailUnavailable(new ApiError(500, "x"), false)).toBe(false);
    expect(billDetailUnavailable(new Error("x"), false)).toBe(false);
  });

  it("guardar el detalle: 422 con campo da mensaje local, nunca el texto de la API", () => {
    const amount = userMessage(new ApiError(422, "SERVER-TEXT ck_bill_items_sign", { amount_dop: "x" }, "validation_error"), "bill-items-save");
    expect(amount).toMatch(/monto/i);
    expect(amount).not.toContain("SERVER-TEXT");
    expect(userMessage(new ApiError(422, "SERVER-TEXT", { label: "x" }), "bill-items-save")).toMatch(/concepto/i);
    expect(userMessage(new ApiError(422, "SERVER-TEXT", {}), "bill-items-save")).toMatch(/conceptos/i);
  });

  it("revisión y carga usan mensajes por estado", () => {
    expect(userMessage(new ApiError(404, "SERVER-TEXT"), "bill-assess")).toBe("No encontrado o sin acceso.");
    expect(userMessage(new ApiError(500, "SERVER-TEXT"), "bill-items-load")).toMatch(/servidor/);
    expect(userMessage(new ApiError(409, "x", {}, "account_changed"), "bill-assess")).toMatch(/cuenta cambió/);
  });
});
