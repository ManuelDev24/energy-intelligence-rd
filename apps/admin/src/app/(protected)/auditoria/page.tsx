"use client";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { Empty, ErrorView, Forbidden, Loading } from "@/components/StateViews";
import { controlStyle } from "@/lib/controls";
import { ScrollRegion } from "@/components/ScrollRegion";

type AuditEvent = {
  id: string; actor_user_id: string | null; action: string; resource: string;
  scope_used: string | null; reason: string | null; result: string; request_id: string | null;
  created_at: string;
};

type State =
  | { status: "loading" }
  | { status: "ok"; items: AuditEvent[]; total: number }
  | { status: "empty" }
  | { status: "forbidden" }
  | { status: "error"; message: string };

export default function AuditoriaPage() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [actionFilter, setActionFilter] = useState("");

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const qs = actionFilter ? `?action=${encodeURIComponent(actionFilter)}` : "";
      const page = await apiFetch<{ items: AuditEvent[]; total: number }>(`/api/v1/admin/audit-events${qs}`);
      setState(page.items.length ? { status: "ok", items: page.items, total: page.total } : { status: "empty" });
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setState({ status: "forbidden" });
      else setState({ status: "error", message: err instanceof Error ? err.message : "Error desconocido" });
    }
  }, [actionFilter]);

  useEffect(() => { void load(); }, [load]);

  if (state.status === "forbidden") return <Forbidden heading="Auditoría" onRetry={load} />;
  if (state.status === "loading") return <Loading />;
  if (state.status === "error") return <ErrorView message={state.message} onRetry={load} />;

  return (
    <section>
      <h1>Auditoría</h1>
      <input style={controlStyle} aria-label="Filtrar por acción" placeholder="Filtrar por acción (p.ej. role.assign)" value={actionFilter}
             onChange={(e) => setActionFilter(e.target.value)} />
      {state.status === "empty" ? <Empty>No hay eventos de auditoría todavía.</Empty> : (
        <ScrollRegion label="Eventos de auditoría"><table>
          <thead>
            <tr><th>Fecha</th><th>Actor</th><th>Acción</th><th>Recurso</th><th>Scope</th><th>Resultado</th><th>Motivo</th></tr>
          </thead>
          <tbody>
            {state.items.map((e) => (
              <tr key={e.id}>
                <td>{new Date(e.created_at).toLocaleString()}</td>
                <td>{e.actor_user_id ?? "—"}</td>
                <td>{e.action}</td>
                <td>{e.resource}</td>
                <td>{e.scope_used ?? "—"}</td>
                <td>{e.result}</td>
                <td>{e.reason ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table></ScrollRegion>
      )}
    </section>
  );
}
