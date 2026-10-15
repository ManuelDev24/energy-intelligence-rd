// ERD-CLAIM-01 (web): lista, alta con validación, detalle con resumen congelado, notas, referencia y cierre.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@energyrd/api-client";
import ClaimsPage from "@/app/(app)/claims/page";
import ClaimDetailPage from "@/app/(app)/claims/[id]/page";
import { getApi } from "@/lib/api";
import { HOME_A } from "./mock-api";
import { renderWithApp } from "./render";

const CLAIM = "cccccccc-0000-4000-8000-0000000000c1";
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "cccccccc-0000-4000-8000-0000000000c1" }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/api", async () => {
  const { createMockApi } = await import("./mock-api");
  const api = createMockApi();
  return { getApi: () => api };
});

const m = (value: string, unit: string, quality: string) => ({ value, unit, quality });
const summary = (over: Record<string, unknown> = {}) => ({ id: CLAIM, home_id: HOME_A, bill_id: "bbbbbbbb-0000-4000-8000-0000000000b1", kind: "billing_error", status: "open", subject: "Cobro mayor al esperado",
  description: "Creo que el cobro de agosto es más alto.", disputed_amount_dop: "500.00", reference_number: null, created_at: "2026-10-14T10:00:00Z", updated_at: "2026-10-14T10:00:00Z",
  closed_at: null, disclaimer: "Este caso es un registro tuyo: no afirma que la distribuidora haya cometido un error.", ...over });
const detail = (over: Record<string, unknown> = {}) => ({ ...summary(), evidence: { bill: { period_start: "2026-08-01", period_end: "2026-08-30", days: 30, kwh: m("390.00", "kWh", "REAL"), amount_dop: m("5460.00", "RD$", "REAL"), avg_price_per_kwh: m("14.00", "RD$/kWh", "ESTIMATED") },
  previous: { period_start: "2026-07-01", period_end: "2026-07-30", days: 30, kwh: m("300.00", "kWh", "REAL"), amount_dop: m("3900.00", "RD$", "REAL"), avg_price_per_kwh: null, kwh_pct: m("30.00", "%", "ESTIMATED"), amount_pct: null },
  readings_in_period: 0, document_id: null, captured_at: "2026-10-14T10:00:00Z", note: "Comparación hecha con los datos que registraste." },
  events: [{ id: "eeeeeeee-0000-4000-8000-000000000001", kind: "created", actor: "user", note: null, status_to: "open", created_at: "2026-10-14T10:00:00Z" }], ...over });

describe("ClaimsPage", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("sin casos explica qué hacer; con casos los lista con su estado", async () => {
    const list = vi.spyOn(getApi(), "listClaims").mockResolvedValue([] as never);
    const first = renderWithApp(<ClaimsPage />, HOME_A);
    expect(await screen.findByText("Aún no tienes reclamaciones")).toBeInTheDocument();
    first.unmount();
    list.mockResolvedValue([summary()] as never);
    renderWithApp(<ClaimsPage />, HOME_A);
    const item = (await screen.findAllByRole("listitem")).find(li => li.textContent?.includes("Cobro mayor"))!;
    expect(within(item).getByTestId("claim-status")).toHaveTextContent("Abierta");
    expect(within(item).getByRole("link", { name: "Cobro mayor al esperado" })).toHaveAttribute("href", `/claims/${CLAIM}`);
  });

  it("valida antes de enviar, pide la factura solo en los tipos de cobro y crea el caso", async () => {
    vi.spyOn(getApi(), "listClaims").mockResolvedValue([] as never);
    vi.spyOn(getApi(), "listBills").mockResolvedValue([{ id: "bbbbbbbb-0000-4000-8000-0000000000b1", home_id: HOME_A, period_start: "2026-08-01", period_end: "2026-08-30" }] as never);
    const create = vi.spyOn(getApi(), "createClaim").mockResolvedValue(detail() as never);
    renderWithApp(<ClaimsPage />, HOME_A);
    fireEvent.click(await screen.findByRole("button", { name: /Nueva reclamación/ }));
    fireEvent.click(screen.getByRole("button", { name: "Crear reclamación" }));
    expect(await screen.findByText("Elige de qué se trata.")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Factura")).toBeNull();
    fireEvent.change(screen.getByLabelText("¿De qué se trata?"), { target: { value: "billing_error" } });
    expect(await screen.findByLabelText("Factura")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Asunto"), { target: { value: "Cobro mayor" } });
    fireEvent.change(screen.getByLabelText("Qué pasó"), { target: { value: "Creo que el cobro de agosto es más alto." } });
    fireEvent.click(screen.getByRole("button", { name: "Crear reclamación" }));
    expect(await screen.findByText("Elige la factura a la que se refiere.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Factura"), { target: { value: "bbbbbbbb-0000-4000-8000-0000000000b1" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear reclamación" }));
    await waitFor(() => expect(create).toHaveBeenCalledWith(HOME_A, expect.objectContaining({ kind: "billing_error", bill_id: "bbbbbbbb-0000-4000-8000-0000000000b1", subject: "Cobro mayor" })));
  });

  it("un duplicado se explica sin mostrar texto del servidor", async () => {
    vi.spyOn(getApi(), "listClaims").mockResolvedValue([] as never);
    vi.spyOn(getApi(), "createClaim").mockRejectedValue(new ApiError(409, "detalle interno", {}, "claim_conflict"));
    renderWithApp(<ClaimsPage />, HOME_A);
    fireEvent.click(await screen.findByRole("button", { name: /Nueva reclamación/ }));
    fireEvent.change(screen.getByLabelText("¿De qué se trata?"), { target: { value: "other" } });
    fireEvent.change(screen.getByLabelText("Asunto"), { target: { value: "Voltaje bajo" } });
    fireEvent.change(screen.getByLabelText("Qué pasó"), { target: { value: "Hay variaciones de voltaje por las noches." } });
    fireEvent.click(screen.getByRole("button", { name: "Crear reclamación" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ya tienes una reclamación abierta de este tipo para esa factura.");
    expect(screen.queryByText(/detalle interno/)).toBeNull();
  });
});

describe("ClaimDetailPage", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("muestra lo que cuentas, el resumen con calidad, el historial y el aviso neutral", async () => {
    vi.spyOn(getApi(), "getClaim").mockResolvedValue(detail() as never);
    renderWithApp(<ClaimDetailPage />, HOME_A);
    expect(await screen.findByRole("heading", { name: "Cobro mayor al esperado" })).toBeInTheDocument();
    const evidence = screen.getByRole("region", { name: "Resumen de tus datos" });
    expect(within(evidence).getByText("Consumo facturado").nextElementSibling).toHaveTextContent("390 kWh");
    expect(within(evidence).getByText("Cambio de consumo (estimado)")).toBeInTheDocument();
    expect(within(evidence).getByText(/No cambia aunque edites la factura/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Historial" })).toHaveTextContent("Caso creado");
    expect(screen.getByText(/no afirma que la distribuidora haya cometido un error/)).toBeInTheDocument();
    expect(screen.getByTestId("claim-reference")).toHaveTextContent("aún sin registrar");
  });

  it("agrega nota, guarda la referencia y cierra con confirmación", async () => {
    vi.spyOn(getApi(), "getClaim").mockResolvedValue(detail() as never);
    const note = vi.spyOn(getApi(), "addClaimNote").mockResolvedValue(detail() as never);
    const ref = vi.spyOn(getApi(), "setClaimReference").mockResolvedValue(detail({ reference_number: "DIST-1" }) as never);
    const close = vi.spyOn(getApi(), "closeClaim").mockResolvedValue(detail({ status: "closed" }) as never);
    renderWithApp(<ClaimDetailPage />, HOME_A);
    fireEvent.change(await screen.findByLabelText("Agregar una nota"), { target: { value: "Llamé a la distribuidora." } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar nota" }));
    await waitFor(() => expect(note).toHaveBeenCalledWith(HOME_A, CLAIM, "Llamé a la distribuidora."));
    fireEvent.change(screen.getByLabelText("Número de referencia de la distribuidora"), { target: { value: " DIST-1 " } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar número" }));
    await waitFor(() => expect(ref).toHaveBeenCalledWith(HOME_A, CLAIM, "DIST-1"));
    fireEvent.click(screen.getByRole("button", { name: "Cerrar caso" }));
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Sí, cerrar" }));
    await waitFor(() => expect(close).toHaveBeenCalledWith(HOME_A, CLAIM, undefined));
  });

  it("un caso cerrado no ofrece acciones", async () => {
    vi.spyOn(getApi(), "getClaim").mockResolvedValue(detail({ status: "closed", closed_at: "2026-10-14T12:00:00Z" }) as never);
    renderWithApp(<ClaimDetailPage />, HOME_A);
    expect(await screen.findByTestId("claim-status")).toHaveTextContent("Cerrada");
    expect(screen.queryByRole("button", { name: "Cerrar caso" })).toBeNull();
    expect(screen.queryByLabelText("Agregar una nota")).toBeNull();
  });
});
