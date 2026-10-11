"use client";
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@energyrd/api-client";
import type { Home, MemberOut } from "@energyrd/api-contracts";
import { keys } from "@/lib/api/hooks";
import {
  createInvitation, leaveHome, listInvitations, listMembers, removeMember, revokeInvitation, sharingMessage, transferOwnership,
} from "@/lib/auth/sharing";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Field } from "./ui/field";

type Confirm = { kind: "remove" | "transfer"; member: MemberOut } | { kind: "leave" } | null;
const sharingKey = (homeId: string, part: string) => ["sharing", homeId, part] as const;

/** ERD-SHARE-01. El propietario administra miembros e invitaciones; un miembro solo puede salir. */
export function SharePanel({ home, onClose }: { home: Home; onClose: () => void }) {
  const qc = useQueryClient();
  const members = useQuery({
    queryKey: sharingKey(home.id, "members"), queryFn: () => listMembers(home.id), retry: false,
  });
  // 403 = no eres propietario: solo se muestra «Salir de la vivienda». Cualquier otro error es un fallo real.
  const isMember = members.error instanceof ApiError && members.error.status === 403;
  const isOwner = members.isSuccess;
  const invitations = useQuery({
    queryKey: sharingKey(home.id, "invitations"), queryFn: () => listInvitations(home.id), enabled: isOwner, retry: false,
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: ["sharing", home.id] }), qc.invalidateQueries({ queryKey: keys.homes }),
  ]);
  const run = useMutation({
    mutationFn: async (action: () => Promise<unknown>) => action(),
    onMutate: () => { setError(null); setNotice(null); },
    onError: (cause) => setError(sharingMessage(cause)),
  });
  const pending = run.isPending;

  function invite(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const address = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) { setError("Indica un correo electrónico válido."); setNotice(null); return; }
    run.mutate(() => createInvitation(home.id, address), {
      onSuccess: async () => { setEmail(""); setNotice(`Invitación enviada a ${address.toLowerCase()}. Caduca en 7 días.`); await refresh(); },
    });
  }
  function confirmAction(event: FormEvent) {
    event.preventDefault();
    if (pending || !confirm) return;
    const current = confirm;
    if (current.kind === "transfer" && password.length < 12) { setError("Escribe tu contraseña para confirmar."); return; }
    const action = current.kind === "leave" ? () => leaveHome(home.id)
      : current.kind === "remove" ? () => removeMember(home.id, current.member.user_id)
        : () => transferOwnership(home.id, current.member.user_id, password);
    run.mutate(action, {
      onSuccess: async () => {
        setConfirm(null); setPassword("");
        setNotice(current.kind === "leave" ? "Saliste de la vivienda." : current.kind === "remove" ? "Miembro expulsado." : "Propiedad transferida. Ahora eres miembro.");
        await refresh();
        if (current.kind === "leave") onClose();
      },
    });
  }

  return (
    <Card aria-label={`Compartir ${home.name}`}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xl font-semibold">Compartir «{home.name}»</h2>
        <Button type="button" variant="outline" onClick={onClose}>Cerrar</Button>
      </div>
      {members.isLoading ? <p role="status" className="mt-3 text-sm">Cargando…</p> : null}
      {members.isError && !isMember ? (
        <div className="mt-3"><p role="alert" className="text-sm text-red-600">{sharingMessage(members.error)}</p>
          <Button type="button" variant="outline" className="mt-2" onClick={() => void members.refetch()}>Reintentar</Button></div>
      ) : null}
      {error ? <p role="alert" className="mt-3 text-sm text-red-600">{error}</p> : null}
      {notice ? <p role="status" className="mt-3 text-sm text-green-700">{notice}</p> : null}

      {isOwner ? (
        <>
          <h3 className="mt-5 text-base font-semibold">Miembros</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {members.data.map((member) => (
              <li key={member.user_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm">
                <span>{member.email} · <strong>{member.role === "owner" ? "Propietario" : "Miembro"}</strong></span>
                {member.role === "member" ? (
                  <span className="flex gap-2">
                    <Button type="button" variant="outline" disabled={pending} onClick={() => { setConfirm({ kind: "transfer", member }); setError(null); }} aria-label={`Transferir la propiedad a ${member.email}`}>Transferir propiedad</Button>
                    <Button type="button" variant="outline" disabled={pending} onClick={() => { setConfirm({ kind: "remove", member }); setError(null); }} aria-label={`Expulsar a ${member.email}`}>Expulsar</Button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>

          <h3 className="mt-5 text-base font-semibold">Invitar</h3>
          <form onSubmit={invite} className="mt-2 flex flex-col gap-3" noValidate>
            <Field name="invite-email" label="Correo de la persona invitada" type="email" autoComplete="off" maxLength={254} value={email}
              onChange={(e) => setEmail(e.target.value)} hint="Recibirá un enlace de un solo uso. Debe abrirlo con una cuenta de ese mismo correo." />
            <Button type="submit" disabled={pending}>{pending ? "Enviando…" : "Enviar invitación"}</Button>
          </form>

          <h3 className="mt-5 text-base font-semibold">Invitaciones pendientes</h3>
          {invitations.isSuccess && invitations.data.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No hay invitaciones pendientes.</p> : null}
          <ul className="mt-2 flex flex-col gap-2">
            {invitations.data?.map((invitation) => (
              <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm">
                <span>{invitation.email} · caduca el {new Date(invitation.expires_at).toLocaleDateString("es-DO")}</span>
                <Button type="button" variant="outline" disabled={pending} aria-label={`Revocar la invitación a ${invitation.email}`}
                  onClick={() => run.mutate(() => revokeInvitation(home.id, invitation.id), { onSuccess: async () => { setNotice("Invitación revocada."); await refresh(); } })}>Revocar</Button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {isMember || isOwner ? (
        <div className="mt-5 border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">
            {isMember ? "Eres miembro de esta vivienda: puedes verla y usarla, pero solo el propietario gestiona quién más accede." : "Si ya no quieres gestionar esta vivienda, transfiere la propiedad antes de salir."}
          </p>
          {confirm?.kind !== "leave" ? <Button type="button" variant="outline" className="mt-3" disabled={pending} onClick={() => { setConfirm({ kind: "leave" }); setError(null); }}>Salir de la vivienda…</Button> : null}
        </div>
      ) : null}

      {confirm ? (
        <form onSubmit={confirmAction} className="mt-4 flex flex-col gap-3 rounded-lg border border-border p-3" aria-label="Confirmar acción" noValidate>
          <p className="text-sm font-medium">
            {confirm.kind === "leave" ? "¿Salir de esta vivienda? Dejarás de verla." : confirm.kind === "remove" ? `¿Expulsar a ${confirm.member.email}? Perderá el acceso de inmediato.`
              : `¿Transferir la propiedad a ${confirm.member.email}? Pasarás a ser miembro y no podrás deshacerlo tú.`}
          </p>
          {confirm.kind === "transfer" ? <Field name="transfer-password" label="Tu contraseña" type="password" autoComplete="current-password" maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} /> : null}
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Confirmar"}</Button>
            <Button type="button" variant="outline" disabled={pending} onClick={() => { setConfirm(null); setPassword(""); setError(null); }}>Cancelar</Button>
          </div>
        </form>
      ) : null}
    </Card>
  );
}
