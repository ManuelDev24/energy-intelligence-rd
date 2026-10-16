"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function snapshot() {
  return navigator.onLine;
}

function serverSnapshot() {
  return true;
}

export function ConnectivityNotice() {
  const online = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  if (online) return null;

  return (
    <div role="status" aria-live="polite" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      Sin conexión. Tus formularios siguen disponibles; al volver la red, actualizaremos las lecturas. Los cambios no se reenvían automáticamente.
    </div>
  );
}
