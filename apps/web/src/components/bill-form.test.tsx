import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BillForm } from "./bill-form";

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("BillForm", () => {
  it("muestra errores y no envía si los datos son inválidos", () => {
    const onSubmit = vi.fn();
    render(<BillForm submitLabel="Guardar" onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
  });

  it("envía el valor validado cuando todo es correcto", () => {
    const onSubmit = vi.fn();
    render(<BillForm submitLabel="Guardar" onSubmit={onSubmit} />);

    fill("Inicio del período", "2026-08-01");
    fill("Fin del período", "2026-08-31");
    fill("Consumo facturado (kWh)", "410.5");
    fill("Monto (RD$)", "5480.00");
    fill("Días facturados", "31");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(onSubmit).toHaveBeenCalledWith({
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      kwh: "410.5",
      amount_dop: "5480.00",
      days: 31,
      reading_previous: null,
      reading_current: null,
    });
  });

  it("muestra el error devuelto por el servidor", () => {
    render(<BillForm submitLabel="Guardar" serverError="Período solapado" onSubmit={vi.fn()} />);
    expect(screen.getByText("Período solapado")).toBeInTheDocument();
  });
});
