import type { CSSProperties } from "react";

/** Controles de la consola: 32 px de alto como mínimo (WCAG 2.5.8 pide 24; antes medían 21 y axe lo marcaba como serio). */
export const controlStyle: CSSProperties = { minHeight: 32, padding: "4px 10px", boxSizing: "border-box", fontSize: 14 };

/** Campo de formulario a todo el ancho, con aire entre campos (login). */
export const fieldStyle: CSSProperties = { ...controlStyle, display: "block", width: "100%", marginBottom: 12 };
