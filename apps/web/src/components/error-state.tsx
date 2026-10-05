"use client";

import { RotateCw, TriangleAlert, WifiOff } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** false solo cuando el navegador sabe que no hay red (en el servidor se asume conexión). */
function useOnline() {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

interface ErrorStateProps {
  /** Mensaje del error tal como lo devuelve la API/cliente. */
  message?: string;
  title?: string;
  onRetry?: () => void;
}

/** Error al cargar, con botón Reintentar. Si el navegador está sin conexión lo dice claramente. */
export function ErrorState({ message, title = "No se pudo cargar", onRetry }: ErrorStateProps) {
  const online = useOnline();
  const Icon = online ? TriangleAlert : WifiOff;
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-xl border border-danger-border bg-danger-bg p-4 text-danger"
    >
      <p className="flex items-center gap-2 font-semibold">
        <Icon className="h-4 w-4 shrink-0" aria-hidden /> {online ? title : "Sin conexión"}
      </p>
      {online ? (
        message ? <p className="text-sm">{message}</p> : null
      ) : (
        <p className="text-sm">Revisa tu conexión a internet. Los datos se cargarán al reintentar.</p>
      )}
      {onRetry ? (
        <Button variant="outline" className="h-11" onClick={onRetry}>
          <RotateCw className="mr-1 h-4 w-4" aria-hidden /> Reintentar
        </Button>
      ) : null}
    </div>
  );
}
