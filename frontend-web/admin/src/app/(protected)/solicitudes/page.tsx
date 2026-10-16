"use client";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { hasScope } from "@/lib/access";
import { ErrorView, Forbidden, Loading } from "@/components/StateViews";
import { AdminUserRequestRow } from "@/components/AdminUserRequestRow";
import { controlStyle } from "@/lib/controls";
import { type AdminUserRequestsPage, type UserRequestStatus } from "@/lib/user-requests";

type Filter = "" | UserRequestStatus;
type State = { status: "loading" } | { status: "ok"; data: AdminUserRequestsPage } | { status: "forbidden" } | { status: "error"; message: string };

export default function UserRequestsPage() {
  const { access } = useSession();
  const [filter, setFilter] = useState<Filter>("pending");
  const [offset, setOffset] = useState(0);
  const [state, setState] = useState<State>({ status: "loading" });
  const load = useCallback(async () => {
    setState({ status: "loading" });
    const query = new URLSearchParams({ limit: "25", offset: String(offset) });
    if (filter) query.set("status", filter);
    try {
      const data = await apiFetch<AdminUserRequestsPage>(`/api/v1/admin/user-requests?${query}`);
      setState({ status: "ok", data });
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setState({ status: "forbidden" });
      else setState({ status: "error", message: err instanceof Error ? err.message : "Error desconocido" });
    }
  }, [filter, offset]);
  useEffect(() => { void load(); }, [load]);

  if (state.status === "forbidden") return <Forbidden heading="Solicitudes de datos" onRetry={load} />;
  if (state.status === "loading") return <Loading />;
  if (state.status === "error") return <ErrorView message={state.message} onRetry={load} />;
  const canViewUser = hasScope(access, "admin.users.read");
  const canManageRequests = hasScope(access, "admin.users.requests.manage");
  return (
    <section>
      <h1>Solicitudes de datos</h1>
      <p style={{ color: "#555", maxWidth: "70ch" }}>
        Esta cola registra y tramita solicitudes; no genera exportaciones ni borra cuentas. Cada transición requiere un motivo y se audita.
      </p>
      <label htmlFor="request-status-filter">Filtrar por estado</label>{" "}
      <select id="request-status-filter" value={filter} onChange={(event) => { setFilter(event.target.value as Filter); setOffset(0); }} style={controlStyle}>
        <option value="pending">Pendiente</option>
        <option value="in_progress">En revisión</option>
        <option value="completed">Atendida</option>
        <option value="rejected">Rechazada</option>
        <option value="">Todos</option>
      </select>{" "}
      <button type="button" onClick={() => void load()} style={controlStyle}>Actualizar</button>
      <p role="status">{state.data.total} solicitudes</p>
      <div role="region" aria-label="Solicitudes registradas" tabIndex={0} style={{ overflowX: "auto" }}>
        <table>
          <caption>Solicitudes de exportación y borrado registradas</caption>
          <thead><tr><th scope="col">Creada</th><th scope="col">Tipo</th><th scope="col">Persona (UUID)</th><th scope="col">Estado</th><th scope="col">Motivo</th><th scope="col">Tramitar</th></tr></thead>
          <tbody>
            {state.data.items.map((item) => <AdminUserRequestRow key={item.id} item={item} canViewUser={canViewUser} canManageRequests={canManageRequests} onChanged={load} />)}
          </tbody>
        </table>
      </div>
      <p>Mostrando {state.data.items.length ? offset + 1 : 0}–{Math.min(offset + state.data.items.length, state.data.total)} de {state.data.total}</p>
      <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 25))} style={controlStyle}>Anterior</button>{" "}
      <button type="button" disabled={offset + state.data.items.length >= state.data.total}
        onClick={() => setOffset(offset + 25)} style={controlStyle}>Siguiente</button>
      {state.data.items.length === 0 ? <p>No hay solicitudes con este estado.</p> : null}
    </section>
  );
}
