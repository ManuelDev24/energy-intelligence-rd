import type { CSSProperties } from "react";

/** Controles de la consola: 32 px de alto como mínimo (WCAG 2.5.8 pide 24; antes medían 21 y axe lo marcaba como serio). */
export const controlStyle: CSSProperties = { minHeight: 32, padding: "4px 10px", boxSizing: "border-box", fontSize: 14 };

/** Campo de formulario a todo el ancho, con aire entre campos (login). */
export const fieldStyle: CSSProperties = { ...controlStyle, display: "block", width: "100%", marginBottom: 12 };

/** Texto solo para lectores de pantalla (p. ej. la cabecera de una columna de botones). */
export const visuallyHidden: CSSProperties = { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" };

/** Campo que ocupa el ancho de su columna (formularios en rejilla): sin ancho intrínseco que desborde en pantallas estrechas. */
export const fillStyle: CSSProperties = { ...controlStyle, width: "100%", minWidth: 0 };
