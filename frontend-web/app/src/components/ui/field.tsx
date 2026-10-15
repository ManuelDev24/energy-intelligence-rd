"use client";

import { useId, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { controlClass, controlErrorClass, type ControlWidth } from "./control";
import { describedBy, FormField } from "./form-field";

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "width"> {
  label: string;
  error?: string;
  hint?: string;
  /** Ancho semántico: xs · sm · md (defecto) · lg · full. */
  width?: ControlWidth;
}

export function Field({ label, error, hint, id, className, width, ...props }: FieldProps) {
  const autoId = useId();
  const inputId = id ?? props.name ?? autoId;
  return (
    <FormField id={inputId} label={label} error={error} hint={hint} width={width}>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(inputId, error, hint)}
        className={cn(controlClass, error && controlErrorClass, className)}
        {...props}
      />
    </FormField>
  );
}
