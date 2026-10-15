// ERD-UI-KIT: Modal accesible (foco atrapado y devuelto, Escape, fondo, aria) y ConfirmDialog.
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import { ConfirmDialog, Modal } from "./modal";

function Harness({ onClose = vi.fn(), dismissible = true }: { onClose?: () => void; dismissible?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Abrir</button>
      <Modal open={open} title="Título del diálogo" description="Descripción corta" dismissible={dismissible}
        onClose={() => { onClose(); setOpen(false); }}>
        <button>Primero</button>
        <button>Segundo</button>
      </Modal>
    </>
  );
}

it("no pinta nada cuando está cerrado", () => {
  render(<Modal open={false} title="X" onClose={() => {}}><p>contenido</p></Modal>);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByText("contenido")).not.toBeInTheDocument();
});

it("es un diálogo modal con nombre y descripción accesibles", () => {
  render(<Modal open title="Eliminar factura" description="No se puede deshacer" onClose={() => {}}><p>hola</p></Modal>);
  const dialog = screen.getByRole("dialog", { name: "Eliminar factura" });
  expect(dialog).toHaveAttribute("aria-modal", "true");
  expect(dialog).toHaveAccessibleDescription("No se puede deshacer");
});

it("mueve el foco adentro al abrir y lo devuelve al botón que lo abrió al cerrar", () => {
  render(<Harness />);
  const opener = screen.getByRole("button", { name: "Abrir" });
  opener.focus();
  fireEvent.click(opener);
  expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(opener).toHaveFocus();
});

it("Escape y el fondo cierran; hacer clic dentro no", () => {
  const onClose = vi.fn();
  render(<Harness onClose={onClose} />);
  fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
  fireEvent.mouseDown(screen.getByRole("button", { name: "Primero" }));
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.mouseDown(screen.getByTestId("modal-backdrop"));
  expect(onClose).toHaveBeenCalledTimes(1);
});

it("con dismissible=false ni Escape ni el fondo cierran (acción en curso)", () => {
  const onClose = vi.fn();
  render(<Harness onClose={onClose} dismissible={false} />);
  fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  fireEvent.mouseDown(screen.getByTestId("modal-backdrop"));
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});

it("atrapa el foco: Tab desde el último vuelve al primero y Shift+Tab desde el primero va al último", () => {
  render(<Modal open title="T" onClose={() => {}}><button>A</button><button>B</button></Modal>);
  const [close, a, b] = [screen.getByRole("button", { name: "Cerrar" }), screen.getByRole("button", { name: "A" }), screen.getByRole("button", { name: "B" })];
  b.focus();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab" });
  expect(close).toHaveFocus();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab", shiftKey: true });
  expect(b).toHaveFocus();
  a.focus();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab" });
  expect(a).toHaveFocus(); // en medio no se intercepta (el navegador mueve el foco)
});

it("bloquea el scroll del fondo mientras está abierto y lo restaura", () => {
  document.body.style.overflow = "auto";
  const { rerender } = render(<Modal open title="T" onClose={() => {}}><p>x</p></Modal>);
  expect(document.body.style.overflow).toBe("hidden");
  rerender(<Modal open={false} title="T" onClose={() => {}}><p>x</p></Modal>);
  expect(document.body.style.overflow).toBe("auto");
});

it("ConfirmDialog confirma y cancela, y mientras está pendiente deshabilita todo", () => {
  const onConfirm = vi.fn(); const onCancel = vi.fn();
  const { rerender } = render(<ConfirmDialog open title="¿Eliminar?" message="No se puede deshacer." confirmLabel="Eliminar" destructive onConfirm={onConfirm} onCancel={onCancel} />);
  expect(screen.getByRole("dialog", { name: "¿Eliminar?" })).toHaveAccessibleDescription("No se puede deshacer.");
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(onCancel).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  rerender(<ConfirmDialog open title="¿Eliminar?" message="m" confirmLabel="Eliminar" pendingLabel="Eliminando…" pending onConfirm={onConfirm} onCancel={onCancel} />);
  expect(screen.getByRole("button", { name: "Eliminando…" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(onCancel).toHaveBeenCalledTimes(1);
  rerender(<ConfirmDialog open title="¿Eliminar?" message="m" confirmLabel="Eliminar" pending onConfirm={onConfirm} onCancel={onCancel} />);
  expect(screen.getByRole("button", { name: "Procesando…" })).toBeDisabled();
});
