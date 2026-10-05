"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useHomes, keys } from "@/lib/api/hooks";
import { useSession } from "@/lib/session";
import { QueryState } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import { OnboardingWizard } from "@/components/onboarding-wizard";
export default function HomesPage() {
  const homes = useHomes();
  const { signIn } = useSession();
  const router = useRouter();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [resumeId, setResumeId] = useState<string | null>(null);
  function select(id: string) { signIn(id); router.push("/dashboard"); }
  function finish(id: string) { void qc.invalidateQueries({ queryKey: keys.homes }); select(id); }
  return <><h1 className="text-2xl font-bold">Mis viviendas</h1><p className="text-sm text-muted-foreground">Solo ves viviendas a las que tu cuenta tiene acceso. Las viviendas del piloto no se asignan al registrarte.</p>
    <QueryState isLoading={homes.isLoading} error={homes.error}>
      {homes.data?.length === 0 ? <p>Aún no tienes viviendas. Crea la primera para empezar.</p> : <ul className="flex flex-col gap-3">{homes.data?.map(home => <li key={home.id} className="flex flex-wrap gap-2"><Button variant="outline" className="h-auto min-h-10 flex-1 justify-start whitespace-normal py-3 text-left" onClick={() => select(home.id)}>{home.name} · {home.distributor}</Button><Button variant="outline" onClick={() => { setResumeId(home.id); setCreating(true); }}>Configurar</Button></li>)}</ul>}
    </QueryState>
    {creating || homes.data?.length === 0 ? <OnboardingWizard key={resumeId ?? "new"} initialHome={homes.data?.find(home => home.id === resumeId)} onComplete={finish} /> : <Button onClick={() => { setResumeId(null); setCreating(true); }}>Añadir vivienda</Button>}
  </>;
}
