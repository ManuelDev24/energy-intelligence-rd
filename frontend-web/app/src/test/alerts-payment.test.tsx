// ERD-ALERT-02 (web): alertas de varios tipos y severidades, y marcar la factura como pagada.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AlertsPage from "@/app/(app)/alerts/page";
import BillDetailPage from "@/app/(app)/bills/[id]/page";
import { getApi } from "@/lib/api";
import { ALERT_A, BILLS, HOME_A } from "./mock-api";
import { renderWithApp } from "./render";

vi.mock("@/lib/api", async () => {
  const { createMockApi } = await import("./mock-api");
  const api = createMockApi();
  return { getApi: () => api };
});
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "aaaaaaaa-0000-4000-8000-000000000003" }), useRouter: () => ({ push }) }));

const alert = (over: Record<string, unknown>) => ({ ...ALERT_A, kwh_pct: null, threshold_pct: null, basis_bill_id: null, basis_period_start: null, basis_period_end: null, ...over });
const MIXED = [
  alert({ id: "a1000000-0000-4000-8000-000000000001", type: "stale_readings", severity: "info", status: "unread", bill_id: null, message: "Hace 20 días que no registra una lectura." }),
  alert({ id: "a1000000-0000-4000-8000-000000000002", type: "bill_variation", severity: "savings", status: "unread", message: "El consumo bajó 25% frente al período anterior." }),
  alert({ id: "a1000000-0000-4000-8000-000000000003", type: "payment_due", severity: "critical", status: "read", message: "La factura venció hace 3 días." }),
  alert({ id: "a1000000-0000-4000-8000-000000000004", type: "missing_bill", severity: "warning", status: "unread", bill_id: null, message: "Han pasado 80 días desde la última factura." }),
];

describe("AlertsPage: tipos y severidades", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("muestra primero lo urgente, un titular por tipo y las cuatro severidades", async () => {
    vi.spyOn(getApi(), "listAlerts").mockResolvedValue(MIXED as never);
    renderWithApp(<AlertsPage />, HOME_A);
    await screen.findByText(/Factura vencida/);
    const names = screen.getAllByRole("listitem").map((li) => li.getAttribute("aria-label"));
    expect(names).toHaveLength(4);
    expect(names[0]).toMatch(/^Crítica: Factura vencida/);                 // crítica primero, aunque ya esté leída
    expect(names[1]).toMatch(/^Advertencia: Falta registrar una factura/);  // luego advertencia
    expect(names[2]).toMatch(/^Información: Lecturas atrasadas/);           // luego información
    expect(names[3]).toMatch(/^Ahorro: Ahorro frente al período anterior/); // el ahorro, al final
  });

  it("cada tipo ofrece resolverlo donde corresponde", async () => {
    vi.spyOn(getApi(), "listAlerts").mockResolvedValue(MIXED as never);
    renderWithApp(<AlertsPage />, HOME_A);
    await screen.findByText(/Factura vencida/);
    expect(screen.getByRole("link", { name: /Ver factura: Factura vencida/ })).toHaveAttribute("href", `/bills/${BILLS[2].id}`);
    expect(screen.getByRole("link", { name: /Registrar factura: Falta registrar/ })).toHaveAttribute("href", "/bills/new");
    expect(screen.getByRole("link", { name: /Registrar lectura: Lecturas atrasadas/ })).toHaveAttribute("href", "/readings");
  });

  it("sin alertas el estado vacío habla también de facturas por vencer", async () => {
    vi.spyOn(getApi(), "listAlerts").mockResolvedValue([]);
    renderWithApp(<AlertsPage />, HOME_A);
    expect(await screen.findByText("Sin alertas")).toBeInTheDocument();
    expect(screen.getByText(/factura está por vencer/)).toBeInTheDocument();
  });

  it("marcar leída y descartar siguen funcionando para los tipos nuevos", async () => {
    vi.spyOn(getApi(), "listAlerts").mockResolvedValue(MIXED as never);
    const set = vi.spyOn(getApi(), "setAlertStatus").mockResolvedValue(MIXED[0] as never);
    renderWithApp(<AlertsPage />, HOME_A);
    const card = (await screen.findByText("Hace 20 días que no registra una lectura.")).closest("li")!;
    fireEvent.click(within(card).getByRole("button", { name: /Marcar leída/ }));
    await waitFor(() => expect(set).toHaveBeenCalledWith(HOME_A, MIXED[0].id, "read"));
  });
});

describe("Detalle de factura: pago (ERD-ALERT-02)", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());
  const withDue = (paid: boolean) => ({ ...BILLS[2], due_date: "2026-09-15", paid_at: paid ? "2026-09-10T12:00:00Z" : null });

  it("sin fecha límite no hay sección de pago", async () => {
    renderWithApp(<BillDetailPage />, HOME_A);
    await screen.findByText("Días facturados");
    expect(screen.queryByText("Fecha límite de pago")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Marcar como/ })).not.toBeInTheDocument();
  });

  it("con fecha límite muestra el estado y permite marcarla pagada", async () => {
    vi.spyOn(getApi(), "getBill").mockResolvedValue(withDue(false) as never);
    const pay = vi.spyOn(getApi(), "setBillPayment").mockResolvedValue(withDue(true) as never);
    renderWithApp(<BillDetailPage />, HOME_A);
    expect(await screen.findByText("Fecha límite de pago")).toBeInTheDocument();
    expect(screen.getByText("Pendiente")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Marcar como pagada" }));
    await waitFor(() => expect(pay).toHaveBeenCalledWith(HOME_A, BILLS[2].id, true));
  });

  it("una factura pagada se puede volver a dejar pendiente", async () => {
    vi.spyOn(getApi(), "getBill").mockResolvedValue(withDue(true) as never);
    const pay = vi.spyOn(getApi(), "setBillPayment").mockResolvedValue(withDue(false) as never);
    renderWithApp(<BillDetailPage />, HOME_A);
    expect(await screen.findByText(/Pagada el/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Marcar como pendiente" }));
    await waitFor(() => expect(pay).toHaveBeenCalledWith(HOME_A, BILLS[2].id, false));
  });
});
