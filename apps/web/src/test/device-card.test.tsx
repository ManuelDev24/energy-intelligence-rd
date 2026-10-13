// ERD-DEV-02 (web): tarjeta de equipo, formulario con tipo/marca/modelo/icono y paridad del catálogo con el contrato.
import { EQUIPMENT_ICONS, EQUIPMENT_KINDS } from "@energyrd/core";
import { EquipmentInSchema, EquipmentOutSchema } from "@energyrd/api-contracts";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import EquipmentPage from "@/app/(app)/equipment/page";
import { DeviceCard, LUCIDE_BY_ICON } from "@/components/device-card";
import { getApi } from "@/lib/api";
import { HOME_B } from "./mock-api";
import { renderWithApp } from "./render";

const metric = (value: string, unit: string) => ({ value, unit, quality: "ESTIMATED" as const });
const item = {
  id: "cccccccc-0000-4000-8000-0000000000a1", home_id: "bbbbbbbb-0000-4000-8000-000000000001", name: "Aire sala", room: "Sala",
  kind: "air_conditioner" as const, brand: "Samsung", model: "AR12", icon: null, power_w: "1500.00", hours_per_day: "6.00", created_at: "2026-10-01T00:00:00Z",
};
const est = {
  equipment_id: item.id, name: item.name, room: item.room, kind: item.kind, brand: item.brand, model: item.model, icon: item.icon,
  daily_kwh: metric("9.00", "kWh/día"), monthly_kwh: metric("270.00", "kWh/mes"), share_pct: metric("71.43", "%"),
};

vi.mock("@/lib/api", async () => {
  const { createMockApi } = await import("./mock-api");
  const api = createMockApi();
  return { getApi: () => api };
});

describe("catálogo de equipos vs contrato de la API", () => {
  it("los tipos e iconos de @energyrd/core son exactamente los del contrato generado", () => {
    expect([...EquipmentInSchema.shape.kind._def.innerType.options]).toEqual([...EQUIPMENT_KINDS]);
    const icon = EquipmentInSchema.shape.icon._def.innerType.options[0];
    expect([...icon.options]).toEqual([...EQUIPMENT_ICONS]);
    expect([...EquipmentOutSchema.shape.kind.options]).toEqual([...EQUIPMENT_KINDS]);
  });

  it("cada icono del catálogo tiene su componente", () => {
    for (const icon of EQUIPMENT_ICONS) expect(LUCIDE_BY_ICON[icon]).toBeDefined();
  });
});

describe("DeviceCard", () => {
  it("muestra tipo, habitación, marca, modelo, uso, estimado y el % del servidor", () => {
    render(<DeviceCard item={item} estimate={est} onEdit={() => {}} onDelete={() => {}} />);
    expect(screen.getByRole("heading", { name: "Aire sala" })).toBeInTheDocument();
    expect(screen.getByText("Aire acondicionado · Sala")).toBeInTheDocument();
    expect(screen.getByTestId("device-make-model")).toHaveTextContent("Samsung AR12");
    expect(screen.getByText("1,500 W · 6 h/día")).toBeInTheDocument();
    expect(screen.getByTestId("device-share")).toHaveTextContent("71.43% del total estimado");
    expect(screen.getByText("ESTIMADO")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar Aire sala" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Eliminar Aire sala" })).toBeInTheDocument();
  });

  it("sin estimado ni marca no inventa cifras ni texto vacío", () => {
    render(<DeviceCard item={{ ...item, brand: null, model: null, room: null }} />);
    expect(screen.queryByTestId("device-share")).toBeNull();
    expect(screen.queryByTestId("device-make-model")).toBeNull();
    expect(screen.queryByText("ESTIMADO")).toBeNull();
    expect(screen.getByText("Aire acondicionado")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("EquipmentPage con detalles (ERD-DEV-02)", () => {
  it("guarda tipo, marca, modelo e icono y la tarjeta los muestra con su %", async () => {
    renderWithApp(<EquipmentPage />, HOME_B);
    fireEvent.click(await screen.findByRole("button", { name: /Agregar equipo/ }));
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Aire dormitorio" } });
    fireEvent.change(screen.getByLabelText("Tipo de equipo"), { target: { value: "air_conditioner" } });
    fireEvent.change(screen.getByLabelText("Marca (opcional)"), { target: { value: " LG " } });
    fireEvent.change(screen.getByLabelText("Modelo (opcional)"), { target: { value: "X9" } });
    fireEvent.click(screen.getByRole("radio", { name: "Icono: Abanico" }));
    fireEvent.change(screen.getByLabelText("Potencia (W)"), { target: { value: "1200" } });
    fireEvent.change(screen.getByLabelText("Horas de uso por día"), { target: { value: "8" } });
    const create = vi.spyOn(getApi(), "createEquipment");
    fireEvent.click(screen.getByRole("button", { name: "Guardar equipo" }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0][1]).toMatchObject({ kind: "air_conditioner", brand: "LG", model: "X9", icon: "fan", name: "Aire dormitorio" });
    const heading = await screen.findByRole("heading", { name: "Aire dormitorio" });
    const card = heading.closest("article") as HTMLElement;
    expect(within(card).getByTestId("device-make-model")).toHaveTextContent("LG X9");
    await waitFor(() => expect(within(card).getByTestId("device-share")).toBeInTheDocument());
  });

  it("el selector de icono es un grupo de opciones con estado", async () => {
    renderWithApp(<EquipmentPage />, HOME_B);
    fireEvent.click(await screen.findByRole("button", { name: /Agregar equipo/ }));
    const group = screen.getByRole("radiogroup", { name: "Icono" });
    const radios = within(group).getAllByRole("radio");
    expect(radios).toHaveLength(EQUIPMENT_ICONS.length + 1);
    expect(radios[0]).toHaveAttribute("aria-checked", "true");
    fireEvent.click(radios[2]);
    expect(radios[2]).toHaveAttribute("aria-checked", "true");
    expect(radios[0]).toHaveAttribute("aria-checked", "false");
  });
});
