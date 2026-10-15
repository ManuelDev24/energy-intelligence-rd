"use client";
import { useRef, useState } from "react";
import { apiMessage } from "@/lib/auth/request";
import { requestEmailVerification } from "@/lib/auth/settings";
import { useSession } from "@/lib/session";
import { Button } from "./ui/button";

/**
 * Auditoría C-10: aviso mientras el correo de la cuenta no está confirmado. Sin confirmar no se envían avisos por correo.
 * Permite reenviar el enlace (la API limita los envíos por hora). No aparece en modo piloto ni con el correo ya confirmado.
 */
export function EmailVerificationNotice({ className = "" }: { className?: string }) {
  const { authEnabled, user } = useSession();
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const inFlight = useRef(false);
  if (!authEnabled || !user || user.email_verified_at) return null;

  async function resend() {
    if (inFlight.current) return;
    inFlight.current = true; setState("sending"); setMessage(null);
    try {
      const result = await requestEmailVerification();
      setState("sent");
      setMessage(result.status === "already_verified" ? "Tu correo ya está confirmado. Recarga la página." : `Te enviamos un enlace a ${user!.email}. Revisa también la carpeta de spam.`);
    } catch (cause) {
      setState("error"); setMessage(apiMessage(cause));
    } finally { inFlight.current = false; }
  }

  return (
    <div role="status" data-testid="email-verification-notice" className={`rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 ${className}`}>
      <p className="font-medium">Confirma tu correo para recibir avisos por correo.</p>
      <p className="mt-1">Abre el enlace que enviamos a <strong>{user.email}</strong>. Mientras tanto la app funciona igual, pero no te escribiremos.</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" onClick={() => void resend()} disabled={state === "sending"}>
          {state === "sending" ? "Enviando…" : "Reenviar el enlace"}
        </Button>
        {message ? <span role={state === "error" ? "alert" : undefined} className={state === "error" ? "text-danger" : ""}>{message}</span> : null}
      </div>
    </div>
  );
}
