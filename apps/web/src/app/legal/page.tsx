"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { authEnabled, fetchLegal } from "@/lib/auth/client";
import type { LegalOut } from "@energyrd/api-contracts";
import { Card } from "@/components/ui/card";

export default function LegalPage() {
  const [legal, setLegal] = useState<LegalOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!authEnabled) return;
    let active = true;
    fetchLegal()
      .then(data => { if (active) setLegal(data); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "No se pudieron cargar los documentos legales."); });
    return () => { active = false; };
  }, []);
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-12">
      <Card>
        <h1 className="text-2xl font-bold">Términos y Política de Privacidad</h1>
        {!authEnabled ? (
          <p className="mt-3 text-sm text-muted-foreground">No disponible en el piloto local.</p>
        ) : error ? (
          <p role="alert" className="mt-3 text-sm text-danger">{error}</p>
        ) : (
          <>
            <p role="status" className="mt-3 text-sm font-semibold text-amber-700">
              Documento en BORRADOR, pendiente de revisión legal. El contenido final puede cambiar.
            </p>
            {legal ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Versión de términos: {legal.terms_version} · Versión de privacidad: {legal.privacy_version}
              </p>
            ) : (
              <p role="status" className="mt-2 text-sm">Cargando…</p>
            )}
            <p className="mt-4 text-sm text-muted-foreground">
              Energy RD está en fase piloto. Los términos de uso y la política de privacidad definitivos se
              publicarán tras la revisión legal conforme a la Ley 172-13 de Protección de Datos de República
              Dominicana. Mientras tanto, al crear una cuenta aceptas usar el servicio bajo estas condiciones
              provisionales, sujetas a cambio.
            </p>
          </>
        )}
        <p className="mt-6 text-sm"><Link href="/register" className="text-primary underline">Volver al registro</Link></p>
      </Card>
    </main>
  );
}
