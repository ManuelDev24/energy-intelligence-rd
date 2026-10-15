"use client";
import type { ReactNode } from "react";
import { controlStyle } from "@/lib/controls";

export function Loading() {
  return <p role="status" style={{ padding: 24 }}>Cargando…</p>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p role="status" style={{ padding: 24, color: "#666" }}>{children}</p>;
}

export function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" style={{ padding: 24 }}>
      <p style={{ color: "#b00020" }}>{message}</p>
      <button style={controlStyle} onClick={onRetry}>Reintentar</button>
    </div>
  );
}

export function Forbidden({ onRetry, heading }: { onRetry: () => void; heading?: string }) {
  return (
    <div role="alert" style={{ padding: 24 }}>
      {heading ? <h1>{heading}</h1> : null}
      <p>No tienes permiso para ver esta sección (403).</p>
      <button style={controlStyle} onClick={onRetry}>Reintentar</button>
    </div>
  );
}
