"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { controlStyle } from "@/lib/controls";
import { allowedNextStatuses, requestKindLabel, requestStatusLabel, type AdminUserRequest, type UserRequestStatus } from "@/lib/user-requests";

function date(value: string) {
  return new Date(value).toLocaleString("es-DO", { timeZone: "America/Santo_Domingo" });
}

export function AdminUserRequestRow({ item, canViewUser, canManageRequests, onChanged }: {
  item: AdminUserRequest;
  canViewUser: boolean;
  canManageRequests: boolean;
  onChanged: () => Promise<void>;
}) {
  const next = allowedNextStatuses(item.status);
  const [status, setStatus] = useState<UserRequestStatus>(next[0] ?? item.status);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(null); setMessage(null);
    try {
      await apiFetch<AdminUserRequest>(`/api/v1/admin/user-requests/${item.id}/transition`, {
        method: "POST", body: JSON.stringify({ status, reason }),
      });
      setReason("");
      setMessage(`Estado actualizado: ${requestStatusLabel(status)}.`);
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo actualizar la solicitud.");
    } finally { setBusy(false); }
  }

  return (
    <tr>
      <td>{date(item.created_at)}</td>
      <td>{requestKindLabel(item.kind)}</td>
      <td>{canViewUser ? <Link href={`/usuarios/${item.target_user_id}`}>{item.target_user_id}</Link> : item.target_user_id}</td>
      <td>{requestStatusLabel(item.status)}</td>
      <td>{item.reason}{item.resolution_reason ? <p>Resolución: {item.resolution_reason}</p> : null}</td>
      <td>
        {next.length && canManageRequests ? (
          <form aria-label={`Tramitar solicitud ${item.id}`} onSubmit={submit} style={{ display: "grid", gap: 6, minWidth: 220 }}>
            <label htmlFor={`transition-status-${item.id}`}>Siguiente estado</label>
            <select id={`transition-status-${item.id}`} value={status}
              onChange={(event) => setStatus(event.target.value as UserRequestStatus)} style={controlStyle}>
              {next.map((candidate) => <option value={candidate} key={candidate}>{requestStatusLabel(candidate)}</option>)}
            </select>
            <label htmlFor={`transition-reason-${item.id}`}>Motivo</label>
            <input id={`transition-reason-${item.id}`} value={reason} maxLength={500} required
              onChange={(event) => setReason(event.target.value)} style={controlStyle} />
            <button type="submit" disabled={busy} style={controlStyle}>
              {busy ? "Guardando…" : status === "in_progress" ? "Iniciar revisión" : status === "completed" ? "Marcar atendida" : "Rechazar solicitud"}
            </button>
            {message ? <span role="status">{message}</span> : null}
            {error ? <span role="alert">{error}</span> : null}
          </form>
        ) : next.length ? <span>Solo lectura: no tienes permiso para tramitar esta solicitud.</span> : <span>Sin acciones pendientes</span>}
      </td>
    </tr>
  );
}
