/**
 * Enlace de texto independiente (no dentro de una frase): `py-2` lo lleva de ~17 a ~33 px de alto para que sea cómodo de tocar
 * (antes cada página repetía su propia copia de estas clases sin área extra).
 */
export const textLinkClass = "inline-block py-2 text-primary underline focus-visible:ring-2 focus-visible:ring-primary";

/** Enlace dentro de una frase: sin padding, para no partir la línea (WCAG 2.5.8 lo exime por ser en línea). */
export const inlineLinkClass = "text-primary underline focus-visible:ring-2 focus-visible:ring-primary";
