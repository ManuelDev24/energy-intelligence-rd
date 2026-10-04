"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { QueryState } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { useHomes } from "@/lib/api/hooks";
import { useSession } from "@/lib/session";

export default function LoginPage() {
  const router = useRouter();
  const { signIn } = useSession();
  const homes = useHomes();
  const [selected, setSelected] = useState("");

  function enter() {
    if (!selected) return;
    signIn(selected);
    router.push("/dashboard");
  }

  return (
    <>
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-12">
        <h1 className="text-3xl font-bold">⚡ Energy RD</h1>
        <Card>
          <CardTitle>Acceso demo</CardTitle>
          <CardDescription>
            La API todavía no tiene autenticación. Elige una vivienda para continuar; no se piden ni
            se guardan credenciales.
          </CardDescription>
          <div className="mt-4 flex flex-col gap-4">
            <QueryState isLoading={homes.isLoading} error={homes.error}>
              <div className="flex flex-col gap-1">
                <label htmlFor="home" className="text-sm font-medium">
                  Vivienda
                </label>
                <select
                  id="home"
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                  className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
                >
                  <option value="">Selecciona…</option>
                  {homes.data?.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name} · {h.distributor}
                    </option>
                  ))}
                </select>
              </div>
              <Button onClick={enter} disabled={!selected}>
                Entrar
              </Button>
            </QueryState>
          </div>
        </Card>
      </main>
    </>
  );
}
