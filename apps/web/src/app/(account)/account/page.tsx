"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/session";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

function DeleteAccountSection() {
  const { deleteAccount } = useSession();
  const router = useRouter();
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    setPending(true); setError(null);
    try {
      await deleteAccount(password);
      qc.clear();
      router.replace("/login?deleted=1");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo eliminar la cuenta.");
    } finally { setPassword(""); setPending(false); }
  }
  return (
    <Card>
      <h2 className="text-xl font-semibold text-danger">Eliminar cuenta</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Esta acción es permanente. Las viviendas donde eres el único miembro se eliminarán junto con todos sus
        datos. Si eres el único propietario de una vivienda compartida, la eliminación quedará bloqueada hasta
        transferir la propiedad a otro miembro o expulsar a los demás (en «Mis viviendas» → «Compartir»).
      </p>
      {!confirming ? (
        <Button type="button" variant="outline" className="mt-4 border-danger text-danger" onClick={() => setConfirming(true)}>
          Eliminar cuenta…
        </Button>
      ) : (
        <form className="mt-4 flex flex-col gap-4" onSubmit={event => void submit(event)} aria-busy={pending}>
          <Field
            name="delete-password"
            label="Confirma tu contraseña"
            type="password"
            autoComplete="current-password"
            minLength={12}
            maxLength={128}
            value={password}
            onChange={event => setPassword(event.target.value)}
            required
            disabled={pending}
          />
          {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={pending || !password} className="bg-danger text-white hover:opacity-90">
              {pending ? "Eliminando…" : "Confirmar eliminación definitiva"}
            </Button>
            <Button type="button" variant="outline" disabled={pending} onClick={() => { setConfirming(false); setPassword(""); setError(null); }}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

export default function AccountPage() {
  const { user, error, signOut } = useSession();
  const [pending, setPending] = useState(false);
  const router = useRouter();
  async function logout() { setPending(true); await signOut(); router.replace("/login"); setPending(false); }
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h1 className="text-2xl font-bold">Mi cuenta</h1>
        <p className="my-4 break-words">{user?.email}</p>
        <p className="mb-4 text-sm text-muted-foreground">La sesión vence sin renovación automática. Inicia sesión de nuevo cuando se solicite. ¿Olvidaste tu contraseña? <Link href="/olvide-contrasena" className="underline">Recupérala aquí</Link>.</p>
        {error ? <p role="alert">{error}</p> : null}
        <Button onClick={() => void logout()} disabled={pending}>{pending ? "Cerrando…" : "Cerrar sesión"}</Button>
      </Card>
      <DeleteAccountSection />
    </div>
  );
}
