"use client";

import { useId, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { controlClass, controlErrorClass, type ControlWidth } from "./control";
import { describedBy, FormField } from "./form-field";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  hint?: string;
  /** Ancho semántico: xs · sm · md (defecto) · lg · full. */
  width?: ControlWidth;
}

/** `<select>` nativo con la misma caja, etiqueta y mensajes que Field (el nativo es el más accesible y el mejor en móvil). */
export function Select({ label, error, hint, id, className, width, children, ...props }: SelectProps) {
  const autoId = useId();
  const selectId = id ?? props.name ?? autoId;
  return (
    <FormField id={selectId} label={label} error={error} hint={hint} width={width}>
      <select
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(selectId, error, hint)}
        className={cn(controlClass, error && controlErrorClass, className)}
        {...props}
      >
        {children}
      </select>
    </FormField>
  );
}
