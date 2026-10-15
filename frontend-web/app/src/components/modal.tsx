"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "./ui/button";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * ERD-UI-KIT: diálogo modal accesible. `role="dialog"` + `aria-modal`, nombre y descripción accesibles, foco atrapado,
 * Escape y clic en el fondo cierran (salvo `dismissible={false}`, p. ej. con una acción en curso), el foco vuelve a
 * quien lo abrió y el scroll del fondo se bloquea. Sustituye a `window.confirm`.
 */
export function Modal({ open, title, description, onClose, dismissible = true, children }: {
  open: boolean; title: string; description?: string; onClose: () => void; dismissible?: boolean; children: ReactNode;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Foco inicial: el primer control del contenido (no el botón «Cerrar»), o el propio panel.
    const controls = panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    (controls && controls.length > 1 ? controls[1] : panel.current)?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      opener.current?.focus();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;
  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      if (dismissible) { event.stopPropagation(); onClose(); }
      return;
    }
    if (event.key !== "Tab" || !panel.current) return;
    const controls = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (controls.length === 0) { event.preventDefault(); panel.current.focus(); return; }
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  return createPortal(
    <div data-testid="modal-backdrop" className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onMouseDown={(event) => { if (dismissible && event.target === event.currentTarget) onClose(); }}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1} onKeyDown={onKeyDown}
        className="w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-xl focus-visible:outline-none">
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
          <Button type="button" variant="outline" size="sm" disabled={!dismissible} onClick={onClose}>Cerrar</Button>
        </div>
        {description ? <p id={descriptionId} className="mt-2 text-sm text-muted-foreground">{description}</p> : null}
        <div className="mt-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** Confirmación de una acción (normalmente destructiva). Mientras `pending`, nada se puede cancelar ni cerrar. */
export function ConfirmDialog({ open, title, message, confirmLabel, pendingLabel, destructive = false, pending = false, onConfirm, onCancel }: {
  open: boolean; title: string; message: string; confirmLabel: string; pendingLabel?: string; destructive?: boolean; pending?: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <Modal open={open} title={title} description={message} dismissible={!pending} onClose={onCancel}>
      <div className="flex flex-wrap justify-end gap-3">
        <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>Cancelar</Button>
        <Button type="button" disabled={pending} onClick={onConfirm} className={destructive ? "bg-danger text-white hover:opacity-90" : undefined}>
          {pending ? (pendingLabel ?? "Procesando…") : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
