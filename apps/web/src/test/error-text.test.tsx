import { ApiError } from "@energyrd/api-client";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QueryState } from "@/components/query-state";
import { userMessage } from "@/lib/api/errors";

// QA ERD-WEB-QUALITY (API real): en el piloto sin BFF el texto `detail` de la API llegaba a la pantalla.
describe("la UI nunca muestra el texto de error de la API", () => {
  it("QueryState sin errorMessage usa un mensaje local según el estado", () => {
    render(<QueryState isLoading={false} error={new ApiError(500, "SECRET-UPSTREAM", {}, "internal")} onRetry={() => {}}>x</QueryState>);
    expect(screen.queryByText(/SECRET-UPSTREAM/)).not.toBeInTheDocument();
    expect(screen.getByText("Error del servidor. Inténtalo de nuevo más tarde.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reintentar/ })).toBeInTheDocument();
  });

  it("QueryState con un Error que no es de la API tampoco muestra su texto", () => {
    render(<QueryState isLoading={false} error={new Error("TypeError: internal stack")}>x</QueryState>);
    expect(screen.queryByText(/internal stack/)).not.toBeInTheDocument();
    expect(screen.getByText("No se pudo completar la solicitud.")).toBeInTheDocument();
  });

  it.each([
    [409, "bill-save", "Ya existe una factura que se solapa con ese período."],
    [422, "bill-save", "Revisa los datos de la factura."],
    [422, "ocr", "No se pudo leer la imagen (JPG, PNG o HEIC de hasta 10 MB). Puedes registrar la factura manualmente."],
    [404, "bill-delete", "La factura ya no existe. Actualiza la lista."],
    [422, "equipment-save", "Revisa los datos del equipo."],
    [404, "alert-update", "La alerta ya no existe. Actualiza la lista."],
  ] as const)("%i en %s → mensaje local", (status, context, text) => {
    expect(userMessage(new ApiError(status, "SERVER-TEXT", {}, "x"), context)).toBe(text);
  });
});
