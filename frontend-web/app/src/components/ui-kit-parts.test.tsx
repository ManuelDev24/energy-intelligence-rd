// ERD-UI-KIT: BillCard, RecommendationCard y DateRangePicker.
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { BillCard } from "./bill-card";
import { DateRangePicker } from "./date-range-picker";
import { RecommendationCard } from "./recommendation-card";

const BILL = { id: "aaaaaaaa-0000-4000-8000-000000000003", period_start: "2026-08-01", period_end: "2026-08-31", kwh: "420.00", amount_dop: "5600.00", source: "manual" as const };

it("BillCard enlaza al detalle y muestra período, kWh, monto y origen", () => {
  render(<BillCard bill={BILL} />);
  const link = screen.getByRole("link");
  expect(link).toHaveAttribute("href", `/bills/${BILL.id}`);
  expect(link).toHaveTextContent("1–31 ago 2026");
  expect(link).toHaveTextContent("420 kWh");
  expect(link).toHaveTextContent("RD$ 5,600.00");
  expect(link).toHaveTextContent("manual");
});
it("BillCard etiqueta las facturas de demostración", () => {
  render(<BillCard bill={{ ...BILL, source: "seed" }} />);
  expect(screen.getByRole("link")).toHaveTextContent("demo");
});

it("RecommendationCard muestra el texto de la API y la acción", () => {
  render(<RecommendationCard text="Revise equipos de mayor uso." action={{ href: "/equipment", label: "Ver equipos" }} />);
  expect(screen.getByText("Revise equipos de mayor uso.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Ver equipos/ })).toHaveAttribute("href", "/equipment");
  expect(screen.getByLabelText(/Recomendación/)).toBeInTheDocument();
});
it.each([null, undefined])("RecommendationCard sin texto (%s) no inventa consejos", (text) => {
  render(<RecommendationCard text={text} />);
  expect(screen.getByText("Sin recomendaciones por ahora.")).toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});

const PRESETS = [{ id: "7d", label: "Últimos 7 días" }, { id: "30d", label: "Últimos 30 días" }] as const;
const picker = (props: Partial<React.ComponentProps<typeof DateRangePicker<"7d" | "30d">>> = {}) => {
  const handlers = { onPreset: vi.fn(), onFrom: vi.fn(), onTo: vi.fn() };
  render(<DateRangePicker presets={PRESETS} selected="30d" from="2026-09-11" to="2026-10-10" today="2026-10-10" error={null} {...handlers} {...props} />);
  return handlers;
};

it("DateRangePicker marca el atajo activo y avisa los cambios; las fechas solo aparecen en «Personalizado»", () => {
  const handlers = picker();
  expect(screen.getByRole("button", { name: "Últimos 30 días" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Últimos 7 días" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.queryByLabelText("Desde")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Últimos 7 días" }));
  expect(handlers.onPreset).toHaveBeenCalledWith("7d");
  fireEvent.click(screen.getByRole("button", { name: "Personalizado" }));
  expect(handlers.onPreset).toHaveBeenCalledWith("custom");
});
it("DateRangePicker personalizado: fechas con máximo hoy, ayuda del límite y cambios", () => {
  const handlers = picker({ selected: "custom" });
  const from = screen.getByLabelText("Desde"); const to = screen.getByLabelText("Hasta");
  expect(from).toHaveAttribute("max", "2026-10-10");
  expect(from).toHaveValue("2026-09-11");
  expect(screen.getByText("Máximo 366 días, ambos incluidos.")).toBeInTheDocument();
  fireEvent.change(from, { target: { value: "2026-09-01" } });
  fireEvent.change(to, { target: { value: "2026-09-30" } });
  expect(handlers.onFrom).toHaveBeenCalledWith("2026-09-01");
  expect(handlers.onTo).toHaveBeenCalledWith("2026-09-30");
});
it("DateRangePicker personalizado con error: lo anuncia y marca los campos inválidos", () => {
  picker({ selected: "custom", error: "El rango no puede superar 366 días." });
  expect(screen.getByRole("alert")).toHaveTextContent("366 días");
  expect(screen.getByLabelText("Desde")).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByLabelText("Hasta")).toHaveAccessibleDescription("El rango no puede superar 366 días.");
});
