"use client";
import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Logo } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardDescription } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { authEnabled } from "@/lib/auth/client";
import { recoveryError, requestPasswordReset } from "@/lib/auth/recovery";

// ERD-AUTH-05: la confirmación es SIEMPRE la misma, exista o no la cuenta (la API responde 202
// en ambos casos), y nunca repite el correo escrito.
const CONFIRMATION = "Si existe una cuenta con ese correo, te enviamos un enlace para restablecer tu contraseña. Consulta la caducidad en el correo. Revisa también la carpeta de correo no deseado.";
const linkClass = "text-primary underline focus-visible:ring-2 focus-visible:ring-primary";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Guardia síncrona: dos clics en el mismo tick verían `pending` todavía en false.
  const inFlight = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const [emailError, setEmailError] = useState<string>();
  useLayoutEffect(() => {
    if (emailError && !pending) form.current?.querySelector<HTMLInputElement>('[name="email"]')?.focus();
  }, [emailError, pending]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || sent) return;
    inFlight.current = true; setPending(true); setError(null); setEmailError(undefined);
    try {
      await requestPasswordReset(email);
      setSent(true); setEmail("");
    } catch (cause) {
      const { kind, message } = recoveryError(cause);
      if (kind === "email") setEmailError(message);
      else setError(kind === "rate_limited" ? "Demasiadas solicitudes de recuperación. Espera unos minutos e inténtalo de nuevo." : kind === "network" ? message : "No se pudo enviar la solicitud. Inténtalo de nuevo más tarde.");
    } finally { inFlight.current = false; setPending(false); }
  }
  return <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-12">
    <Logo size={48} />
    <Card>
      <h1 className="text-2xl font-bold">Recuperar contraseña</h1>
      {!authEnabled ? (
        <p className="mt-3 text-sm text-muted-foreground">La recuperación de contraseña no está disponible en el piloto local.</p>
      ) : sent ? (
        <p role="status" className="mt-3 text-sm">{CONFIRMATION}</p>
      ) : (
        <>
          <CardDescription>Escribe el correo de tu cuenta y te enviaremos un enlace para crear una contraseña nueva.</CardDescription>
          <form ref={form} className="mt-5 flex flex-col gap-4" onSubmit={submit} aria-busy={pending} noValidate>
            <Field error={emailError} name="email" label="Correo electrónico" className="text-base sm:text-sm" type="email" autoComplete="email" maxLength={254} value={email} onChange={event => setEmail(event.target.value)} required disabled={pending} />
            {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
            <Button type="submit" disabled={pending}>{pending ? "Enviando…" : "Enviar enlace"}</Button>
          </form>
        </>
      )}
      <p className="mt-4 text-sm"><Link className={linkClass} href="/login">Volver a iniciar sesión</Link></p>
    </Card>
  </main>;
}
