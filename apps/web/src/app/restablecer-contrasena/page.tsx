"use client";
import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Logo } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardDescription } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { ACCOUNT_CHANGE_KEY, accountGeneration, authEnabled } from "@/lib/auth/client";
import { parseResetToken, recoveryError, resetPassword } from "@/lib/auth/recovery";
import { hardNavigate } from "@/lib/navigation";

function accountMarker() {
  try { return window.localStorage.getItem(ACCOUNT_CHANGE_KEY); } catch { return null; }
}
const linkClass = "text-primary underline focus-visible:ring-2 focus-visible:ring-primary";
type LinkState = "reading" | "valid" | "invalid" | "expired";

export default function ResetPasswordPage() {
  // ERD-AUTH-05: PRIMER efecto de la página (layout effect, antes de cualquier useEffect y de pintar):
  // se lee el token del fragmento, se elimina de la URL con replaceState y solo queda en memoria de
  // este componente. Nunca se guarda en storage, en la URL de la API ni en el DOM.
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const consumed = useRef(false);
  const [token, setToken] = useState<string | null>(null);
  const [link, setLink] = useState<LinkState>("reading");
  useLayoutEffect(() => {
    if (consumed.current) return; // StrictMode repite los efectos: el fragmento ya no existe.
    consumed.current = true;
    const { hash, pathname, search } = window.location;
    if (hash) window.history.replaceState(window.history.state, "", `${pathname}${search}`);
    const parsed = parseResetToken(hash);
    setToken(parsed);
    setLink(parsed ? "valid" : "invalid");
  }, []);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const [fieldError, setFieldError] = useState<{ name: string; message: string } | null>(null);
  useLayoutEffect(() => {
    if (fieldError && !pending) form.current?.querySelector<HTMLInputElement>(`[name="${fieldError.name}"]`)?.focus();
  }, [fieldError, pending]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || !token) return;
    setError(null); setFieldError(null);
    if (password.length < 12 || password.length > 128) { setFieldError({ name: "new_password", message: "La contraseña debe tener entre 12 y 128 caracteres." }); return; }
    if (password !== confirmation) { setFieldError({ name: "confirm_password", message: "Las contraseñas no coinciden." }); return; }
    const generation = accountGeneration();
    const marker = accountMarker();
    const current = () => mounted.current && generation === accountGeneration() && marker === accountMarker();
    inFlight.current = true; setPending(true); setError(null);
    try {
      await resetPassword(token, password);
      if (!current()) return;
      setToken(null); setPassword(""); setConfirmation(""); setDone(true);
      hardNavigate("/login?restablecida=1");
      return; // Se mantiene inFlight: no hay segundo envío mientras se navega.
    } catch (cause) {
      if (!current()) return;
      const { kind, message } = recoveryError(cause);
      if (kind === "invalid_link") { setToken(null); setLink("expired"); }
      else if (kind === "password") setFieldError({ name: "new_password", message });
      else setError(kind === "rate_limited" ? "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." : message);
    }
    setPassword(""); setConfirmation("");
    inFlight.current = false; setPending(false);
  }

  let content;
  if (!authEnabled) content = <p className="mt-3 text-sm text-muted-foreground">La recuperación de contraseña no está disponible en el piloto local.</p>;
  else if (link === "reading") content = <p role="status" className="mt-3 text-sm text-muted-foreground">Verificando enlace…</p>;
  else if (link === "invalid" || link === "expired") content = <div className="mt-3 flex flex-col gap-3 text-sm">
    <p role="alert" className="text-danger">{link === "expired" ? "Enlace inválido o caducado. Consulta la caducidad en el correo. Los enlaces solo se pueden usar una vez." : "Enlace inválido. Abre el enlace completo del correo o solicita uno nuevo."}</p>
    <Link className={linkClass} href="/olvide-contrasena">Solicitar otro enlace</Link>
  </div>;
  else if (done) content = <p role="status" className="mt-3 text-sm">Contraseña restablecida. Redirigiendo al inicio de sesión…</p>;
  else content = <>
    <CardDescription>Elige una contraseña nueva. Al guardarla se cerrarán todas tus sesiones abiertas.</CardDescription>
    <form ref={form} className="mt-5 flex flex-col gap-4" onSubmit={submit} aria-busy={pending} noValidate>
      <Field error={fieldError?.name === "new_password" ? fieldError.message : undefined} name="new_password" label="Nueva contraseña" className="text-base sm:text-sm" type="password" autoComplete="new-password" minLength={12} maxLength={128} hint="Entre 12 y 128 caracteres. No se recorta ni modifica." value={password} onChange={event => setPassword(event.target.value)} required disabled={pending} />
      <Field error={fieldError?.name === "confirm_password" ? fieldError.message : undefined} name="confirm_password" label="Confirmar contraseña" className="text-base sm:text-sm" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={confirmation} onChange={event => setConfirmation(event.target.value)} required disabled={pending} />
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" disabled={pending}>{pending ? "Restableciendo contraseña…" : "Restablecer contraseña"}</Button>
    </form>
  </>;
  return <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-12">
    <Logo size={48} />
    <Card>
      <h1 className="text-2xl font-bold">Restablecer contraseña</h1>
      {content}
      <p className="mt-4 text-sm"><Link className={linkClass} href="/login">Volver a iniciar sesión</Link></p>
    </Card>
  </main>;
}
