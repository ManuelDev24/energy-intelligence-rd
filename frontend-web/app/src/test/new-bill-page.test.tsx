// ERD-OCR-PROD: la página de nueva factura lee el archivo en segundo plano y nunca crea la factura sin confirmación.
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NewBillPage from "@/features/bills/NewBillPage";
import { getApi } from "@/lib/api";
import { HOME_A, OCR_DOC, setMockOcr } from "./mock-api";
import { renderWithApp } from "./render";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/api", async () => {
  const { createMockApi } = await import("./mock-api");
  const api = createMockApi();
  return { getApi: () => api };
});
const push = vi.fn();

function choose(name = "factura.pdf", type = "application/pdf") {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File([new Uint8Array(8)], name, { type })] } });
}
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

describe("NewBillPage con OCR asíncrono", () => {
  beforeEach(() => { window.localStorage.clear(); push.mockClear(); vi.useFakeTimers({ shouldAdvanceTime: true }); setMockOcr("done", 1); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it("acepta fotos y PDF y dice qué se hace con el archivo", () => {
    renderWithApp(<NewBillPage />, HOME_A);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.accept).toBe("image/*,application/pdf");
    expect(screen.getByText(/se guarda cifrado/)).toBeInTheDocument();
    expect(screen.getByText(/se elimina automáticamente/)).toBeInTheDocument();
  });

  it("muestra el progreso, luego el borrador editable, y al confirmar liga el original a la factura", async () => {
    renderWithApp(<NewBillPage />, HOME_A);
    const create = vi.spyOn(getApi(), "createBill");
    choose();
    expect(await screen.findByText(/Analizando tu factura/)).toBeInTheDocument();
    expect(screen.queryByText("Revisa la sugerencia")).not.toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
    await tick(2100);
    await tick(2100);
    expect(await screen.findByText("Revisa la sugerencia")).toBeInTheDocument();
    expect(screen.getByText(/Leído del texto del PDF \(2 de 2 páginas\)/)).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled(); // leer no guarda nada
    fireEvent.click(screen.getByRole("button", { name: "Confirmar y guardar factura" }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0][1]).toMatchObject({ period_start: "2026-10-01", period_end: "2026-10-31", kwh: "320", amount_dop: "4500.00", document_id: OCR_DOC });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
  });

  it("deja de consultar cuando termina", async () => {
    renderWithApp(<NewBillPage />, HOME_A);
    const get = vi.spyOn(getApi(), "getOcrJob");
    choose();
    await tick(2100);
    await tick(2100);
    await screen.findByText("Revisa la sugerencia");
    const calls = get.mock.calls.length;
    await tick(10_000);
    expect(get.mock.calls.length).toBe(calls);
  });

  it("si no se pudo leer, explica el motivo, no ofrece reintentar y permite registrar a mano", async () => {
    setMockOcr("failed", 1, "unreadable");
    renderWithApp(<NewBillPage />, HOME_A);
    choose("borrosa.jpg", "image/jpeg");
    await tick(2100);
    await tick(2100);
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo leer el archivo");
    expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Registrar manualmente" }));
    expect(await screen.findByText("Entrada manual")).toBeInTheDocument();
  });

  it("un fallo temporal del motor ofrece Reintentar y vuelve a consultar", async () => {
    setMockOcr("failed", 1, "engine_error");
    renderWithApp(<NewBillPage />, HOME_A);
    choose();
    await tick(2100);
    await tick(2100);
    fireEvent.click(await screen.findByRole("button", { name: "Reintentar" }));
    await tick(2100);
    await tick(2100);
    expect(await screen.findByText("Revisa la sugerencia")).toBeInTheDocument();
  });

  it("tras un minuto sin terminar avisa sin dejar de esperar", async () => {
    setMockOcr("done", 999);
    renderWithApp(<NewBillPage />, HOME_A);
    choose();
    await screen.findByText(/Analizando tu factura/);
    expect(screen.queryByText(/más de lo normal/)).not.toBeInTheDocument();
    await tick(61_000);
    expect(await screen.findByText(/Está tardando más de lo normal/)).toBeInTheDocument();
    expect(screen.getByText(/Analizando tu factura/)).toBeInTheDocument();
  });

  it("un error al subir muestra un mensaje local y no un borrador", async () => {
    renderWithApp(<NewBillPage />, HOME_A);
    vi.spyOn(getApi(), "startOcrJob").mockRejectedValue(Object.assign(new (await import("@energyrd/api-client")).ApiError(503, "boom s3://x", {}, "storage_unavailable")));
    choose();
    expect(await screen.findByRole("alert")).toHaveTextContent("no está disponible en este momento");
    expect(screen.queryByText(/boom/)).not.toBeInTheDocument();
    expect(screen.queryByText("Revisa la sugerencia")).not.toBeInTheDocument();
  });
});
