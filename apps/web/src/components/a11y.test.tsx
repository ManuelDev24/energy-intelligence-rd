import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BillForm } from "./bill-form";
import { AppShell } from "./app-shell";
import { AlertCard } from "./alert-card";

// ERD-WEB-QUALITY H2/H4: salto al contenido y foco en el primer campo inválido.
vi.mock("@/lib/session", () => ({ useSession: () => ({ homeId: "h1", ready: true, authEnabled: false, user: null }) }));
vi.mock("@/lib/api/hooks", () => ({ useAlerts: () => ({ data: [] }), useHomes: () => ({ data: [] }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard", useRouter: () => ({ replace: vi.fn() }) }));

describe("accesibilidad del shell y formularios", () => {
  it("el primer elemento enfocable es 'Saltar al contenido' y apunta al main enfocable", () => {
    render(<AppShell><p>contenido</p></AppShell>);
    const skip = screen.getByRole("link", { name: "Saltar al contenido" });
    const main = screen.getByRole("main");
    expect(skip).toHaveAttribute("href", `#${main.id}`);
    expect(main.id).not.toBe("");
    expect(main).toHaveAttribute("tabindex", "-1");
    const focusables = document.querySelectorAll("a[href], button, select, input, [tabindex]:not([tabindex='-1'])");
    expect(focusables[0]).toBe(skip);
  });

  it("una alerta anunciada usa role=alert en un <div>, no en <article> (axe aria-allowed-role)", () => {
    render(<AlertCard tone="critical" announce>Subió 50 %</AlertCard>);
    expect(screen.getByRole("alert").tagName).toBe("DIV");
  });

  it("al enviar la factura con errores, el foco va al primer campo inválido", async () => {
    render(<BillForm submitLabel="Guardar" onSubmit={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Guardar" });
    button.focus();
    fireEvent.click(button);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Inicio del período")));
  });

  it("si solo un campo posterior es inválido, enfoca ese campo", async () => {
    render(<BillForm submitLabel="Guardar" onSubmit={vi.fn()} />);
    const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fill("Inicio del período", "2026-08-01");
    fill("Fin del período", "2026-08-31");
    fill("Consumo facturado (kWh)", "-5");
    fill("Monto (RD$)", "5480.00");
    fill("Días facturados", "31");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Consumo facturado (kWh)")));
  });
});
