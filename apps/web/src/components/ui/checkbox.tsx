import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  children: ReactNode;
}

/** Casilla con etiqueta clicable. La fila mide 44 px de alto en táctil para que el área de toque sea cómoda. */
export function Checkbox({ className, children, ...props }: CheckboxProps) {
  return (
    <label className={cn("flex min-h-9 w-fit items-center gap-2 text-sm pointer-coarse:min-h-11", className)}>
      <input type="checkbox" className="h-4 w-4 shrink-0 accent-primary" {...props} />
      <span>{children}</span>
    </label>
  );
}
