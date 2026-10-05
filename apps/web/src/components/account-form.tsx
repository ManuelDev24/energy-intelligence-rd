"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Logo } from "./app-shell";
import { Button } from "./ui/button";
import { Field } from "./ui/field";
import { Card, CardTitle, CardDescription } from "./ui/card";
import { useSession } from "@/lib/session";
export function AccountForm({ mode }: { mode: "login" | "register" }) {
  const { authenticate, error: sessionError } = useSession();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = mode === "login" ? "Iniciar sesión" : "Crear cuenta";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    setPending(true); setError(null);
    try { await authenticate(mode, email, password); router.replace("/homes"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo iniciar sesión."); }
    finally { setPassword(""); setPending(false); }
  }
  return <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-12">
    <Logo size={48} />
    <Card><h1 className="text-2xl font-bold">{label}</h1><CardDescription>Tu cuenta y tus viviendas, sin compartir datos del piloto.</CardDescription>
      <form className="mt-5 flex flex-col gap-4" onSubmit={submit} aria-busy={pending}>
        <Field name="email" label="Correo electrónico" className="text-base sm:text-sm" type="email" autoComplete="email" maxLength={254} value={email} onChange={event => setEmail(event.target.value)} required disabled={pending} />
        <Field name="password" label="Contraseña" className="text-base sm:text-sm" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={12} maxLength={128} hint="Entre 12 y 128 caracteres. No se recorta ni modifica." value={password} onChange={event => setPassword(event.target.value)} required disabled={pending} />
        {error || sessionError ? <p role="alert" className="text-sm text-danger">{error || sessionError} Revisa tus datos o inicia sesión de nuevo.</p> : null}
        <Button type="submit" disabled={pending}>{pending ? `${label} · Verificando…` : label}</Button>
      </form>
      <p className="mt-4 text-sm"><Link className="text-primary underline focus-visible:ring-2 focus-visible:ring-primary" href={mode === "login" ? "/register" : "/login"}>{mode === "login" ? "¿Sin cuenta? Crear cuenta" : "Ya tengo cuenta"}</Link></p>
    </Card>
    <Card><CardTitle>Antes de continuar</CardTitle><p className="mt-2 text-sm text-muted-foreground">La recuperación de contraseña no está disponible. Guarda tu contraseña de forma segura. No verificamos la propiedad del correo electrónico.</p></Card>
  </main>;
}
