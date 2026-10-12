"use client";
import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/app-shell";
import { Card, CardDescription } from "@/components/ui/card";
import { parseResetToken, recoveryError, verifyEmail } from "@/lib/auth/recovery";

type State = "reading" | "working" | "done" | "invalid" | "error";
const linkClass = "text-primary underline focus-visible:ring-2 focus-visible:ring-primary";

/** Auditoría C-10: canjea el enlace del correo. El token se lee del fragmento, se borra de la URL de inmediato y solo vive en memoria. */
export default function VerifyEmailPage() {
  const consumed = useRef(false);
  const [state, setState] = useState<State>("reading");
  const [message, setMessage] = useState<string | null>(null);
  useLayoutEffect(() => {
    if (consumed.current) return; // StrictMode repite los efectos: el fragmento ya no existe
    consumed.current = true;
    const { hash, pathname, search } = window.location;
    if (hash) window.history.replaceState(window.history.state, "", `${pathname}${search}`);
    const token = parseResetToken(hash);
    if (!token) { setState("invalid"); return; }
    setState("working");
    verifyEmail(token).then(() => setState("done")).catch((cause) => {
      const { kind, message: text } = recoveryError(cause);
      if (kind === "invalid_link") { setState("invalid"); return; }
      setMessage(text); setState("error");
    });
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-4">
      <Logo size={48} />
      <Card className="w-full">
        <h1 className="text-2xl font-semibold">Confirmar correo</h1>
        {state === "reading" || state === "working" ? <CardDescription role="status" className="mt-3">Confirmando tu correo…</CardDescription> : null}
        {state === "done" ? (
          <div role="status" className="mt-3 text-sm">
            <p>Listo: tu correo quedó confirmado. Ya puedes recibir avisos por correo.</p>
            {/* Enlace de documento completo a propósito: recarga la sesión para que el aviso de «confirma tu correo» desaparezca. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <p className="mt-3"><a href="/homes" className={linkClass}>Ir a Energy RD</a></p>
          </div>
        ) : null}
        {state === "invalid" ? (
          <div role="alert" className="mt-3 text-sm">
            <p>El enlace no es válido o caducó (cada enlace sirve una sola vez).</p>
            <p className="mt-3">Inicia sesión y usa «Reenviar el enlace» en el aviso de confirmación.</p>
            <p className="mt-3"><Link href="/login" className={linkClass}>Iniciar sesión</Link></p>
          </div>
        ) : null}
        {state === "error" ? <p role="alert" className="mt-3 text-sm text-red-700">{message}</p> : null}
      </Card>
    </main>
  );
}
