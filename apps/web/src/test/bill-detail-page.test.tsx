import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BillDetailPage from "@/app/(app)/bills/[id]/page";
import { getApi } from "@/lib/api";
import { ApiError } from "@/lib/api/types";
import { formatDop } from "@/lib/format";
import { formatReadAt } from "@/lib/rd-time";
import { ASSESSMENT_A, BILLS, HOME_A, billDetail } from "./mock-api";
import { renderWithApp } from "./render";

vi.mock("@/lib/api", async () => {
  const { createMockApi } = await import("./mock-api");
  const api = createMockApi();
  return { getApi: () => api };
});
const BILL = BILLS[2];
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "aaaaaaaa-0000-4000-8000-000000000003" }), useRouter: () => ({ push: vi.fn() }) }));

const ITEMS = [
  { position: 0, label: "Cargo por energía", kind: "charge" as const, amount_dop: "5000.00" },
  { position: 1, label: "Subsidio", kind: "discount" as const, amount_dop: "-150.00" },
];
const section = async () => within(await screen.findByRole("region", { name: "Detalle de cargos" }));
const review = async () => within(await screen.findByRole("region", { name: "Revisión de consistencia" }));

describe("Detalle de factura: Detalle de cargos (ERD-BILL-02)", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("sin ítems muestra 'Sin detalle' en total y diferencia, nunca RD$ 0.00", async () => {
    renderWithApp(<BillDetailPage />, HOME_A);
    const s = await section();
    expect(await s.findByText("Aún no hay conceptos registrados para esta factura.")).toBeInTheDocument();
    expect(s.getByText("Total de ítems").nextSibling).toHaveTextContent("Sin detalle");
    expect(s.getByText("Diferencia con el total de la factura").nextSibling).toHaveTextContent("Sin detalle");
    expect(s.queryByText(/RD\$\s*0\.00/)).not.toBeInTheDocument();
  });

  it("lista los ítems de la API con tipo en texto y muestra total y diferencia tal como llegan", async () => {
    vi.spyOn(getApi(), "getBillItems").mockResolvedValue(billDetail(BILL, ITEMS));
    renderWithApp(<BillDetailPage />, HOME_A);
    const s = await section();
    const rows = await s.findAllByRole("listitem");
    expect(rows[0]).toHaveTextContent(/Cargo por energía.*Cargo/);
    expect(rows[0]).toHaveTextContent(formatDop("5000.00"));
    expect(rows[1]).toHaveTextContent(/Subsidio.*Descuento/);
    expect(rows[1]).toHaveTextContent(formatDop("-150.00"));
    expect(rows).toHaveLength(2);
    expect(s.getByText("Total de ítems").nextSibling).toHaveTextContent(formatDop("4850.00"));
    expect(s.getByText("Diferencia con el total de la factura").nextSibling).toHaveTextContent(formatDop("-750.00"));
    expect(s.getByText("Total de la factura").nextSibling).toHaveTextContent(formatDop(BILL.amount_dop));
  });

  it("valida localmente: descuento positivo no llega a la API", async () => {
    const put = vi.spyOn(getApi(), "putBillItems");
    renderWithApp(<BillDetailPage />, HOME_A);
    const s = await section();
    fireEvent.click(await s.findByRole("button", { name: "Editar detalle" }));
    fireEvent.click(s.getByRole("button", { name: "Añadir concepto" }));
    fireEvent.change(s.getByLabelText("Concepto 1"), { target: { value: "Ajuste" } });
    fireEvent.change(s.getByLabelText("Tipo del concepto 1"), { target: { value: "discount" } });
    fireEvent.change(s.getByLabelText("Monto del concepto 1 (RD$)"), { target: { value: "50" } });
    fireEvent.click(s.getByRole("button", { name: "Guardar detalle" }));
    expect(await s.findByText(/descuento debe ser 0 o negativo/i)).toBeInTheDocument();
    expect(put).not.toHaveBeenCalled();
  });

  it("añade, reordena y quita; guarda el reemplazo completo y no recalcula el total de la factura", async () => {
    vi.spyOn(getApi(), "getBillItems").mockResolvedValueOnce(billDetail(BILL, ITEMS));
    const put = vi.spyOn(getApi(), "putBillItems");
    renderWithApp(<BillDetailPage />, HOME_A);
    const s = await section();
    fireEvent.click(await s.findByRole("button", { name: "Editar detalle" }));
    fireEvent.click(s.getByRole("button", { name: "Añadir concepto" }));
    fireEvent.change(s.getByLabelText("Concepto 3"), { target: { value: "Alumbrado" } });
    fireEvent.change(s.getByLabelText("Monto del concepto 3 (RD$)"), { target: { value: "120.5" } });
    fireEvent.click(s.getByRole("button", { name: "Subir concepto 3" }));
    fireEvent.click(s.getByRole("button", { name: "Quitar concepto 1" }));
    fireEvent.click(s.getByRole("button", { name: "Guardar detalle" }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(put).toHaveBeenCalledWith(HOME_A, BILL.id, { items: [
      { label: "Alumbrado", kind: "charge", amount_dop: "120.50" },
      { label: "Subsidio", kind: "discount", amount_dop: "-150.00" },
    ] });
    expect(await s.findByRole("status")).toHaveTextContent("Detalle guardado.");
    await waitFor(() => expect(s.getByText("Total de ítems").nextSibling).toHaveTextContent(formatDop("-29.50")));
    expect(s.getByText("Total de la factura").nextSibling).toHaveTextContent(formatDop(BILL.amount_dop));
  });

  it("límite de 100: no permite añadir el 101", async () => {
    const many = Array.from({ length: 100 }, (_, position) => ({ position, label: `C${position}`, kind: "charge" as const, amount_dop: "1.00" }));
    vi.spyOn(getApi(), "getBillItems").mockResolvedValue(billDetail(BILL, many));
    renderWithApp(<BillDetailPage />, HOME_A);
    const s = await section();
    fireEvent.click(await s.findByRole("button", { name: "Editar detalle" }));
    expect(s.getByRole("button", { name: "Añadir concepto" })).toBeDisabled();
    expect(s.getByText(/máximo 100 conceptos/i)).toBeInTheDocument();
  });

  it("error de guardado usa mensaje local, nunca el texto de la API", async () => {
    vi.spyOn(getApi(), "putBillItems").mockRejectedValue(new ApiError(422, "SERVER-TEXT ck_bill_items_sign", { amount_dop: "x" }, "validation_error"));
    renderWithApp(<BillDetailPage />, HOME_A);
    const s = await section();
    fireEvent.click(await s.findByRole("button", { name: "Editar detalle" }));
    fireEvent.click(s.getByRole("button", { name: "Guardar detalle" }));
    expect(await s.findByRole("alert")).toHaveTextContent(/Revisa los montos/);
    expect(screen.queryByText(/SERVER-TEXT/)).not.toBeInTheDocument();
  });

  it("error de carga usa mensaje local con Reintentar", async () => {
    vi.spyOn(getApi(), "getBillItems").mockRejectedValue(new ApiError(500, "SERVER-TEXT boom"));
    renderWithApp(<BillDetailPage />, HOME_A);
    const s = await section();
    expect(await s.findByText("Error del servidor. Inténtalo de nuevo más tarde.")).toBeInTheDocument();
    expect(s.getByRole("button", { name: /Reintentar/ })).toBeInTheDocument();
    expect(screen.queryByText(/SERVER-TEXT/)).not.toBeInTheDocument();
  });

  it("piloto sin los endpoints: aviso suave, sin edición ni revisión, la factura sigue visible", async () => {
    vi.spyOn(getApi(), "getBillItems").mockRejectedValue(new ApiError(404, "SERVER-TEXT Not Found"));
    const assess = vi.spyOn(getApi(), "assessBill");
    renderWithApp(<BillDetailPage />, HOME_A);
    const s = await section();
    expect(await s.findByText(/no está disponible en este entorno/i)).toBeInTheDocument();
    expect(s.queryByRole("alert")).not.toBeInTheDocument();
    expect(s.queryByRole("button", { name: "Editar detalle" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revisar consistencia" })).not.toBeInTheDocument();
    expect(screen.getByText(formatDop(BILL.amount_dop))).toBeInTheDocument();
    expect(assess).not.toHaveBeenCalled();
  });
});

describe("Detalle de factura: Revisar consistencia (solo lectura)", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("no llama a validate hasta que se pide", async () => {
    const assess = vi.spyOn(getApi(), "assessBill");
    renderWithApp(<BillDetailPage />, HOME_A);
    await screen.findByRole("button", { name: "Revisar consistencia" });
    expect(assess).not.toHaveBeenCalled();
  });

  it("muestra checks con icono + texto, advertencias, procedencia desconocida y correcciones antes/después", async () => {
    const assess = vi.spyOn(getApi(), "assessBill");
    renderWithApp(<BillDetailPage />, HOME_A);
    fireEvent.click(await screen.findByRole("button", { name: "Revisar consistencia" }));
    const r = await review();
    expect(await r.findByText("Esta revisión no aprueba la factura.")).toBeInTheDocument();
    expect(assess).toHaveBeenCalledWith(HOME_A, BILL.id, expect.anything());
    const checks = within(r.getByRole("list", { name: "Comprobaciones" })).getAllByRole("listitem");
    expect(checks.map(c => c.textContent)).toEqual([
      expect.stringMatching(/Orden del período.*Correcto/),
      expect.stringMatching(/Días facturados.*Advertencia/),
      expect.stringMatching(/Lecturas del medidor.*Sin datos suficientes/),
    ]);
    for (const c of checks) expect(c.querySelector("svg")).not.toBeNull();
    expect(r.getByText("Con advertencias")).toBeInTheDocument();
    expect(within(r.getByRole("list", { name: "Advertencias" })).getAllByRole("listitem")).toHaveLength(2);
    expect(r.getByText("Origen desconocido — dato anterior al registro de originales")).toBeInTheDocument();
    expect(r.queryByText(/verificad/i)).not.toBeInTheDocument();
    const correction = within(r.getByRole("list", { name: "Historial de correcciones" })).getByRole("listitem");
    expect(correction).toHaveTextContent(formatReadAt(ASSESSMENT_A.corrections[0].created_at));
    expect(correction).toHaveTextContent(/Factura/);
    expect(correction).toHaveTextContent(/Monto.*5,500\.00.*5,600\.00/);
    expect(r.queryByText(/aprobad/i)).not.toBeInTheDocument();
  });

  it("origen de creación = 'Original registrado'; sin correcciones lo dice", async () => {
    const base = await getApi().assessBill(HOME_A, BILL.id);
    vi.spyOn(getApi(), "assessBill").mockResolvedValue({ ...base, status: "consistent", warnings: [], provenance: { ...base.provenance, origin: "creation", original_available: true }, corrections: [] });
    renderWithApp(<BillDetailPage />, HOME_A);
    fireEvent.click(await screen.findByRole("button", { name: "Revisar consistencia" }));
    const r = await review();
    expect(await r.findByText("Original registrado")).toBeInTheDocument();
    expect(r.getByText("Sin correcciones registradas.")).toBeInTheDocument();
    expect(r.getByText("Esta revisión no aprueba la factura.")).toBeInTheDocument();
    expect(r.queryByText(/verificad/i)).not.toBeInTheDocument();
  });

  it("error de la revisión usa mensaje local", async () => {
    vi.spyOn(getApi(), "assessBill").mockRejectedValue(new ApiError(500, "SERVER-TEXT"));
    renderWithApp(<BillDetailPage />, HOME_A);
    fireEvent.click(await screen.findByRole("button", { name: "Revisar consistencia" }));
    const r = await review();
    expect(await r.findByText("Error del servidor. Inténtalo de nuevo más tarde.")).toBeInTheDocument();
    expect(screen.queryByText(/SERVER-TEXT/)).not.toBeInTheDocument();
  });

  it("tras guardar el detalle, la revisión ya mostrada se vuelve a pedir", async () => {
    const assess = vi.spyOn(getApi(), "assessBill");
    renderWithApp(<BillDetailPage />, HOME_A);
    fireEvent.click(await screen.findByRole("button", { name: "Revisar consistencia" }));
    await (await review()).findByText("Esta revisión no aprueba la factura.");
    expect(assess).toHaveBeenCalledTimes(1);
    const s = await section();
    fireEvent.click(s.getByRole("button", { name: "Editar detalle" }));
    fireEvent.click(s.getByRole("button", { name: "Guardar detalle" }));
    await waitFor(() => expect(assess).toHaveBeenCalledTimes(2));
  });
});

describe("Detalle de factura: historial truncado (revisión R3)", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("dice que se muestran las 100 correcciones más recientes, como devuelve la API", async () => {
    const api = getApi();
    const original = api.assessBill.bind(api);
    vi.spyOn(api, "assessBill").mockImplementation(async (...args) => ({ ...(await original(...args)), corrections_has_more: true }));
    renderWithApp(<BillDetailPage />, HOME_A);
    fireEvent.click(await screen.findByRole("button", { name: "Revisar consistencia" }));
    const r = await review();
    expect(await r.findByText("Se muestran las 100 correcciones más recientes.")).toBeInTheDocument();
    expect(r.queryByText(/primeras/i)).not.toBeInTheDocument();
  });
});
