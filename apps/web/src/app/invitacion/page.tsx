"use client";
import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Logo } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardDescription } from "@/components/ui/card";
import { keys } from "@/lib/api/hooks";
import { acceptInvitation, parseInvitationToken, sharingMessage } from "@/lib/auth/sharing";
import { useSession } from "@/lib/session";

const linkClass = "text-primary underline focus-visible:ring-2 focus-visible:ring-primary";

/**
 * ERD-SHARE-01: aceptar una invitación. El token llega en el fragmento (`#token=…`): se lee en el PRIMER efecto de
 * layout, se borra de la barra con replaceState y solo vive en memoria de este componente (nunca en storage ni en la
 * URL de la API). Si no hay sesión NO se guarda: se pide iniciar sesión y volver a abrir el enlace del correo.
 */
export default function InvitationPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { ready, user, authEnabled, signIn } = useSession();
  const consumed = useRef(false);
  const [token, setToken] = useState<string | null>(null);
  const [reading, setReading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  useLayoutEffect(() => {
    if (consumed.current) return; // StrictMode repite los efectos: el fragmento ya no existe.
    consumed.current = true;
    const { hash, pathname, search } = window.location;
    if (hash) window.history.replaceState(window.history.state, "", `${pathname}${search}`);
    setToken(parseInvitationToken(hash));
    setReading(false);
  }, []);

  async function accept() {
    if (inFlight.current || !token) return;
    inFlight.current = true; setPending(true); setError(null);
    try {
      const home = await acceptInvitation(token);
      setToken(null);
      await qc.invalidateQueries({ queryKey: keys.homes });
      signIn(home.id);
      router.push("/dashboard");
    } catch (cause) {
      setError(sharingMessage(cause));
      inFlight.current = false; setPending(false);
    }
  }

  let body;
  if (reading || !ready) body = <p role="status">Cargando…</p>;
  else if (!authEnabled) body = <p>Las invitaciones requieren cuentas de usuario y no están disponibles en el modo piloto.</p>;
  else if (!token) {
    body = <p role="alert">Este enlace de invitación no es válido o ya se usó. Pide al propietario de la vivienda que te envíe una nueva.</p>;
  } else if (!user) {
    body = (
      <>
        <p>Te invitaron a ver una vivienda en Energy RD.</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Inicia sesión (o crea una cuenta) con <strong>el mismo correo al que llegó la invitación</strong> y vuelve a abrir el
          enlace del correo. Por seguridad el enlace no se guarda en este navegador.
        </p>
        <p className="mt-4 flex gap-4"><Link className={linkClass} href="/login">Iniciar sesión</Link><Link className={linkClass} href="/register">Crear cuenta</Link></p>
      </>
    );
  } else {
    body = (
      <>
        <p>Te invitaron a ver una vivienda en Energy RD. Aceptarás con la cuenta <strong>{user.email}</strong>.</p>
        {error ? <p role="alert" className="mt-3 text-sm text-red-600">{error}</p> : null}
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <Button type="button" onClick={() => void accept()} disabled={pending}>{pending ? "Aceptando…" : "Aceptar invitación"}</Button>
          <Link className={linkClass} href="/homes">Ir a mis viviendas</Link>
        </div>
      </>
    );
  }
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-4 py-8">
      <Logo />
      <Card>
        <h1 className="text-2xl font-bold">Invitación a una vivienda</h1>
        <CardDescription>Compartir una vivienda da acceso a sus facturas, consumo y metas.</CardDescription>
        <div className="mt-4">{body}</div>
      </Card>
    </main>
  );
}
