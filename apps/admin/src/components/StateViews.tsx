"use client";
import type { ReactNode } from "react";

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
      <button onClick={onRetry}>Reintentar</button>
    </div>
  );
}

export function Forbidden({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" style={{ padding: 24 }}>
      <p>No tienes permiso para ver esta sección (403).</p>
      <button onClick={onRetry}>Reintentar</button>
    </div>
  );
}
