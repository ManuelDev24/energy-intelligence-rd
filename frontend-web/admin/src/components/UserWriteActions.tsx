"use client";
import { useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { hasScope, type MyAccess } from "@/lib/access";
import { controlStyle } from "@/lib/controls";
import type { AdminUserDetail } from "@/lib/users";
import type { AdminUserDeactivationOut, AdminCloseSessionsOut } from "@/lib/user-requests";

export default function UserWriteActions({ user, access, onRefresh }: {
  user: AdminUserDetail;
  access: MyAccess | null;
  onRefresh: () => Promise<void>;
}) {
  const canManageRequests = hasScope(access, "admin.users.requests.manage");
  const canCloseSessions = hasScope(access, "admin.users.sessions.close");
  const canDeactivate = hasScope(access, "admin.users.deactivate");
  const isSelf = access?.user_id === user.id;
  const [kind, setKind] = useState<"export" | "deletion">("export");
  const [requestReason, setRequestReason] = useState("");
  const [securityReason, setSecurityReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!canManageRequests && !canCloseSessions && !canDeactivate) return null;

  async function submitRequest(event: FormEvent) {
    event.preventDefault();
    setBusy("request"); setError(null); setMessage(null);
    try {
      await apiFetch(`/api/v1/admin/users/${user.id}/requests`, {
        method: "POST", body: JSON.stringify({ kind, reason: requestReason }),
      });
      setMessage("Solicitud registrada. No se exportó ni se borró información.");
      setRequestReason("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo registrar la solicitud.");
    } finally { setBusy(null); }
  }

  async function closeSessions(event: FormEvent) {
    event.preventDefault();
    setBusy("sessions"); setError(null); setMessage(null);
    try {
      const result = await apiFetch<AdminCloseSessionsOut>(`/api/v1/admin/users/${user.id}/sessions/close`, {
        method: "POST", body: JSON.stringify({ reason: securityReason }),
      });
      setMessage(`Sesiones cerradas: ${result.closed_sessions}.`);
      setSecurityReason("");
      await onRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudieron cerrar las sesiones.");
    } finally { setBusy(null); }
  }

  async function deactivate(event: FormEvent) {
    event.preventDefault();
    if (!window.confirm("¿Desactivar esta cuenta y cerrar sus sesiones? La acción requiere recuperación administrativa.")) return;
    setBusy("deactivate"); setError(null); setMessage(null);
    try {
      const result = await apiFetch<AdminUserDeactivationOut>(`/api/v1/admin/users/${user.id}/deactivate`, {
        method: "POST", body: JSON.stringify({ reason: securityReason }),
      });
      setMessage(`Cuenta desactivada. Sesiones cerradas: ${result.closed_sessions}.`);
      setSecurityReason("");
      await onRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo desactivar la cuenta.");
    } finally { setBusy(null); }
  }

  return (
    <section aria-labelledby="user-actions-heading" style={{ marginTop: 24, borderTop: "1px solid #ddd", paddingTop: 16 }}>
      <h2 id="user-actions-heading">Acciones administrativas</h2>
      <p style={{ color: "#555", maxWidth: "70ch" }}>
        Cada acción exige un motivo y queda auditada. Las solicitudes de exportación/borrado no ejecutan esas operaciones automáticamente.
      </p>
      {message ? <p role="status">{message}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {canManageRequests ? (
        <form onSubmit={submitRequest} style={{ display: "grid", gap: 8, maxWidth: 520, marginBottom: 20 }}>
          <h3>Registrar solicitud de datos</h3>
          <label htmlFor="user-request-kind">Tipo de solicitud</label>
          <select id="user-request-kind" value={kind} onChange={(event) => setKind(event.target.value as "export" | "deletion")} style={controlStyle}>
            <option value="export">Exportación de datos</option>
            <option value="deletion">Borrado de cuenta</option>
          </select>
          <label htmlFor="user-request-reason">Motivo de la solicitud</label>
          <input id="user-request-reason" required maxLength={500} value={requestReason}
            onChange={(event) => setRequestReason(event.target.value)} style={controlStyle} />
          <button type="submit" disabled={busy !== null} style={controlStyle}>
            {busy === "request" ? "Registrando…" : "Registrar solicitud"}
          </button>
        </form>
      ) : null}
      {canCloseSessions ? (
        <form onSubmit={closeSessions} style={{ display: "grid", gap: 8, maxWidth: 520, marginBottom: 20 }}>
          <h3>Cerrar sesiones</h3>
          <label htmlFor="user-security-reason">Motivo para cerrar sesiones</label>
          <input id="user-security-reason" required maxLength={500} value={securityReason}
            onChange={(event) => setSecurityReason(event.target.value)} style={controlStyle} />
          <button type="submit" disabled={busy !== null} style={controlStyle}>
            {busy === "sessions" ? "Cerrando…" : "Cerrar todas las sesiones"}
          </button>
        </form>
      ) : null}
      {canDeactivate ? (
        <div style={{ maxWidth: 520 }}>
          <h3>Desactivar cuenta</h3>
          {isSelf ? <p>No puedes desactivar tu propia cuenta desde esta pantalla.</p> : !user.active ? <p>La cuenta ya está desactivada.</p> : (
            <form onSubmit={deactivate} style={{ display: "grid", gap: 8 }}>
              <label htmlFor="user-deactivate-reason">Motivo para desactivar cuenta</label>
              <input id="user-deactivate-reason" required maxLength={500} value={securityReason}
                onChange={(event) => setSecurityReason(event.target.value)} style={controlStyle} />
              <button type="submit" disabled={busy !== null} style={{ ...controlStyle, borderColor: "#8f1d1d" }}>
                {busy === "deactivate" ? "Desactivando…" : "Desactivar cuenta y cerrar sesiones"}
              </button>
            </form>
          )}
        </div>
      ) : null}
    </section>
  );
}
