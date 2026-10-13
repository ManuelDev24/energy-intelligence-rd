import type { ReactNode } from "react";

/** Tablas anchas: región con nombre y foco por teclado (WCAG 2.1.1, regla axe `scrollable-region-focusable`). */
export function ScrollRegion({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="region" aria-label={label} tabIndex={0} style={{ position: "relative", overflowX: "auto" }}>
      {children}
    </div>
  );
}
