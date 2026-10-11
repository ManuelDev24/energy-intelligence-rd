"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { reportError } from "@/lib/telemetry";

/** Pantalla de error de la aplicación: el mensaje es fijo (nunca el texto del error) y el fallo se reporta ya redactado. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportError(error);
  }, [error]);
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-bold">Algo salió mal</h1>
      <p role="alert" className="text-sm text-muted-foreground">
        No pudimos mostrar esta pantalla. Puede intentarlo de nuevo; si el problema sigue, vuelva a iniciar sesión.
      </p>
      <Button onClick={reset}>Reintentar</Button>
    </main>
  );
}
