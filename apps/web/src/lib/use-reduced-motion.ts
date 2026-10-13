"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

const getSnapshot = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches;

/** true si el usuario pidió menos movimiento: las gráficas se dibujan sin animación. */
export function useReducedMotion(): boolean {
  // En el servidor asumimos movimiento reducido: así el primer render nunca anima de más.
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}
