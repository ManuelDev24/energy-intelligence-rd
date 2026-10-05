import "@testing-library/jest-dom/vitest";

// jsdom no mide ni implementa ResizeObserver: ResponsiveContainer (Recharts) necesita ambos
// para dibujar. Este observador mínimo informa un tamaño fijo para que las gráficas se rendericen.
if (typeof globalThis.ResizeObserver === "undefined") {
  class FixedSizeResizeObserver {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element) {
      const rect = { width: 600, height: 300, top: 0, left: 0, right: 600, bottom: 300, x: 0, y: 0 };
      const entry = { target, contentRect: { ...rect, toJSON: () => rect } } as unknown as ResizeObserverEntry;
      this.callback([entry], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = FixedSizeResizeObserver as unknown as typeof ResizeObserver;
}
