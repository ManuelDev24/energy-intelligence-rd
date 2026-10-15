// Contrato de tamaño de los controles de formulario (ERD-UI-DENSITY). Un solo lugar define altura, tipografía y ancho.
// Escritorio (puntero fino): 36 px y 14 px de texto. Pantallas táctiles (puntero grueso): 44 px, el mínimo cómodo.
// El ancho depende del tipo de dato, no del contenedor: xs códigos/cantidades · sm teléfono/fecha · md nombres · lg correo · full direcciones.

export type ControlWidth = "xs" | "sm" | "md" | "lg" | "full";

export const controlWidthClass: Record<ControlWidth, string> = {
  xs: "max-w-[8.75rem]", // 140 px
  sm: "max-w-[13.75rem]", // 220 px
  md: "max-w-xs", // 320 px
  lg: "max-w-[25rem]", // 400 px
  full: "",
};

/** Caja visual común de input y select (sin ancho: lo decide el FormField). */
export const controlClass =
  "h-9 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm pointer-coarse:h-11 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60";

export const controlErrorClass = "border-danger";
