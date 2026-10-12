import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";
import { Card } from "./card";
import { Checkbox } from "./checkbox";
import { controlWidthClass } from "./control";
import { Field } from "./field";
import { Select } from "./select";

describe("Field: ancho semántico y compacto por defecto", () => {
  it("usa md (20 rem) salvo que se indique otro ancho", () => {
    render(<Field name="nombre" label="Nombre" />);
    expect(screen.getByLabelText("Nombre").parentElement).toHaveClass(controlWidthClass.md);
  });

  it.each(["xs", "sm", "md", "lg"] as const)("aplica el tope %s al conjunto etiqueta + control", (width) => {
    render(<Field name="x" label="Dato" width={width} />);
    expect(screen.getByLabelText("Dato").parentElement).toHaveClass(controlWidthClass[width]);
  });

  it("full no limita el ancho", () => {
    render(<Field name="x" label="Dirección" width="full" />);
    const wrapper = screen.getByLabelText("Dirección").parentElement!;
    for (const cls of Object.values(controlWidthClass)) if (cls) expect(wrapper).not.toHaveClass(cls);
  });

  it("36 px con puntero fino, 44 px en táctil, y puede encogerse en un grid (min-w-0)", () => {
    render(<Field name="x" label="Dato" />);
    const input = screen.getByLabelText("Dato");
    expect(input).toHaveClass("h-9", "pointer-coarse:h-11", "min-w-0", "text-sm");
  });

  it("enlaza error y ayuda con aria-describedby y marca aria-invalid", () => {
    const { rerender } = render(<Field name="x" label="Dato" hint="Ayuda" />);
    expect(screen.getByLabelText("Dato")).toHaveAttribute("aria-describedby", "x-hint");
    rerender(<Field name="x" label="Dato" hint="Ayuda" error="Obligatorio" />);
    expect(screen.getByLabelText("Dato")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Obligatorio");
    expect(screen.getByLabelText("Dato")).toHaveAttribute("aria-describedby", "x-error");
    expect(screen.getByLabelText("Dato")).toHaveClass("border-danger");
  });

  it("sin name ni id genera un id propio para la etiqueta", () => {
    render(<Field label="Sin nombre" />);
    expect(screen.getByLabelText("Sin nombre")).toHaveAttribute("id");
  });
});

describe("Select", () => {
  it("comparte caja, etiqueta y mensajes con Field", () => {
    render(
      <Select label="Distribuidora" error="Elige una" width="sm" defaultValue="">
        <option value="">—</option>
      </Select>,
    );
    const select = screen.getByLabelText("Distribuidora");
    expect(select).toHaveClass("h-9", "pointer-coarse:h-11");
    expect(select).toHaveAttribute("aria-invalid", "true");
    expect(select.parentElement).toHaveClass(controlWidthClass.sm);
    expect(screen.getByRole("alert")).toHaveTextContent("Elige una");
  });

  it("notifica los cambios", () => {
    const onChange = vi.fn();
    render(
      <Select label="Tipo" onChange={onChange} defaultValue="a">
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>,
    );
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "b" } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe("Checkbox", () => {
  it("la etiqueta completa es clicable y el área mide 44 px en táctil", () => {
    const onChange = vi.fn();
    render(<Checkbox onChange={onChange}>Avisos por correo</Checkbox>);
    fireEvent.click(screen.getByText("Avisos por correo"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("checkbox", { name: "Avisos por correo" }).closest("label")).toHaveClass("pointer-coarse:min-h-11");
  });
});

describe("Button: variantes, tamaños y carga", () => {
  it("danger y tertiary usan tokens semánticos", () => {
    const { rerender } = render(<Button variant="danger">Eliminar</Button>);
    expect(screen.getByRole("button", { name: "Eliminar" })).toHaveClass("bg-danger");
    rerender(<Button variant="tertiary">Ver más</Button>);
    expect(screen.getByRole("button", { name: "Ver más" })).toHaveClass("text-primary");
  });

  it("36 px por defecto y 44 px en táctil; icon es cuadrado", () => {
    const { rerender } = render(<Button>Guardar</Button>);
    expect(screen.getByRole("button")).toHaveClass("h-9", "pointer-coarse:h-11");
    rerender(<Button size="icon" aria-label="Cerrar">x</Button>);
    expect(screen.getByRole("button", { name: "Cerrar" })).toHaveClass("h-9", "w-9", "pointer-coarse:w-11");
  });

  it("loading deshabilita, anuncia ocupado y no dispara onClick", () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Guardando…</Button>);
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("Card: densidad", () => {
  it("16 px por defecto; compact y roomy son explícitas; className puede sobrescribir (p-0)", () => {
    const { rerender } = render(<Card data-testid="c" />);
    expect(screen.getByTestId("c")).toHaveClass("p-4");
    rerender(<Card data-testid="c" density="compact" />);
    expect(screen.getByTestId("c")).toHaveClass("p-3");
    rerender(<Card data-testid="c" density="roomy" />);
    expect(screen.getByTestId("c")).toHaveClass("p-6");
    rerender(<Card data-testid="c" className="p-0" />);
    expect(screen.getByTestId("c")).toHaveClass("p-0");
    expect(screen.getByTestId("c")).not.toHaveClass("p-4");
  });
});
