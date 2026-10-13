"use client";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { hasScope } from "@/lib/access";
import { Empty, ErrorView, Forbidden, Loading } from "@/components/StateViews";
import { controlStyle } from "@/lib/controls";

type Role = { id: string; name: string; description: string; scopes: string[] };
type Assignment = {
  id: string; user_id: string; role_name: string; reason: string; granted_at: string;
  expires_at: string | null; revoked_at: string | null; status: string;
};

type LoadState<T> = { status: "loading" | "ok" | "empty" | "error" | "forbidden"; data?: T; message?: string };

export default function RolesPage() {
  const { access } = useSession();
  const [roles, setRoles] = useState<LoadState<Role[]>>({ status: "loading" });
  const [assignments, setAssignments] = useState<LoadState<Assignment[]>>({ status: "loading" });
  const [reason, setReason] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [roleName, setRoleName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const canManage = hasScope(access, "admin.roles.manage");

  const load = useCallback(async () => {
    setRoles({ status: "loading" });
    setAssignments({ status: "loading" });
    try {
      const data = await apiFetch<Role[]>("/api/v1/admin/roles");
      setRoles({ status: data.length ? "ok" : "empty", data });
    } catch (err) {
      setRoles(toState(err));
    }
    try {
      const page = await apiFetch<{ items: Assignment[] }>("/api/v1/admin/role-assignments");
      setAssignments({ status: page.items.length ? "ok" : "empty", data: page.items });
    } catch (err) {
      setAssignments(toState(err));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function onAssign() {
    setFormError(null);
    try {
      await apiFetch("/api/v1/admin/role-assignments", {
        method: "POST",
        body: JSON.stringify({ user_id: targetUserId, role_name: roleName, reason }),
      });
      setReason("");
      setTargetUserId("");
      setRoleName("");
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "No se pudo asignar el rol");
    }
  }

  async function onRevoke(assignmentId: string) {
    const revokeReason = window.prompt("Motivo de la revocación (obligatorio):");
    if (!revokeReason) return;
    try {
      await apiFetch(`/api/v1/admin/role-assignments/${assignmentId}/revoke`, {
        method: "POST",
        body: JSON.stringify({ reason: revokeReason }),
      });
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "No se pudo revocar");
    }
  }

  if (roles.status === "forbidden") return <Forbidden onRetry={load} />;
  if (roles.status === "loading") return <Loading />;
  if (roles.status === "error") return <ErrorView message={roles.message ?? "Error"} onRetry={load} />;

  return (
    <section>
      <h1>Roles y asignaciones</h1>
      <h2>Roles disponibles</h2>
      {roles.status === "empty" ? <Empty>No hay roles configurados.</Empty> : (
        <ul>
          {roles.data!.map((r) => (
            <li key={r.id}><strong>{r.name}</strong> — {r.description} ({r.scopes.join(", ")})</li>
          ))}
        </ul>
      )}

      {canManage ? (
        <>
          <h2>Asignar rol</h2>
          <div style={{ display: "grid", gap: 8, maxWidth: 420 }}>
            <input style={controlStyle} placeholder="user_id (UUID)" value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)} />
            <select style={controlStyle} value={roleName} onChange={(e) => setRoleName(e.target.value)}>
              <option value="">— elige un rol —</option>
              {roles.data?.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
            </select>
            <input style={controlStyle} placeholder="Motivo (obligatorio)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <button style={controlStyle} onClick={onAssign} disabled={!targetUserId || !roleName || !reason}>Asignar</button>
            {formError ? <p role="alert" style={{ color: "#b00020" }}>{formError}</p> : null}
          </div>
        </>
      ) : null}

      <h2>Asignaciones</h2>
      {assignments.status === "forbidden" ? <Forbidden onRetry={load} /> : null}
      {assignments.status === "loading" ? <Loading /> : null}
      {assignments.status === "error" ? <ErrorView message={assignments.message ?? "Error"} onRetry={load} /> : null}
      {assignments.status === "empty" ? <Empty>No hay asignaciones todavía.</Empty> : null}
      {assignments.status === "ok" ? (
        <table>
          <thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th>Motivo</th><th></th></tr></thead>
          <tbody>
            {assignments.data!.map((a) => (
              <tr key={a.id}>
                <td>{a.user_id}</td>
                <td>{a.role_name}</td>
                <td>{a.status}</td>
                <td>{a.reason}</td>
                <td>
                  {canManage && a.status === "active" ? (
                    <button style={controlStyle} onClick={() => onRevoke(a.id)}>Revocar</button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}

function toState<T>(err: unknown): LoadState<T> {
  if (err instanceof ApiError && err.status === 403) return { status: "forbidden" };
  return { status: "error", message: err instanceof Error ? err.message : "Error desconocido" };
}
