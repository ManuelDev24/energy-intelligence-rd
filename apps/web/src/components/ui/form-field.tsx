import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { controlWidthClass, type ControlWidth } from "./control";

export interface FormFieldProps {
  /** Identificador del control; enlaza la etiqueta y los mensajes. */
  id: string;
  label: string;
  error?: string;
  hint?: string;
  /** Ancho semántico según el dato (por defecto `md`). */
  width?: ControlWidth;
  className?: string;
  children: ReactNode;
}

/** `aria-describedby` coherente con los mensajes que FormField pinta. */
export function describedBy(id: string, error?: string, hint?: string) {
  return error ? `${id}-error` : hint ? `${id}-hint` : undefined;
}

/** Etiqueta + control + ayuda/error, con el ancho semántico aplicado al conjunto. */
export function FormField({ id, label, error, hint, width = "md", className, children }: FormFieldProps) {
  return (
    <div className={cn("flex w-full min-w-0 flex-col gap-1", controlWidthClass[width], className)}>
      <label htmlFor={id} className="text-[13px] font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
