"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { Empty, ErrorView, Forbidden, Loading } from "@/components/StateViews";
import { ScrollRegion } from "@/components/ScrollRegion";
import { controlStyle, fillStyle } from "@/lib/controls";
import { formatDate } from "@/lib/ocr";
import { buildUsersQuery, queryProblem, roleLabel, USERS_PAGE_SIZE, type AdminUsersPage, type VerifiedFilter } from "@/lib/users";

type State = { status: "loading" } | { status: "ok"; page: AdminUsersPage } | { status: "forbidden" } | { status: "error"; message: string };
const labelStyle = { display: "grid", gap: 4, fontSize: 14 } as const;
const linkStyle = { display: "inline-block", minHeight: 24, padding: "4px 0", boxSizing: "border-box" } as const;

export default function UsuariosPage() {
  const [draft, setDraft] = useState("");
  const [draftVerified, setDraftVerified] = useState<VerifiedFilter>("");
  const [applied, setApplied] = useState<{ q: string; verified: VerifiedFilter }>({ q: "", verified: "" });
  const [offset, setOffset] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      setState({ status: "ok", page: await apiFetch<AdminUsersPage>(`/api/v1/admin/users${buildUsersQuery(applied.q, applied.verified, offset)}`) });
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setState({ status: "forbidden" });
      else setState({ status: "error", message: err instanceof Error ? err.message : "Error desconocido" });
    }
  }, [applied, offset]);
  useEffect(() => { void load(); }, [load]);

  if (state.status === "forbidden") return <Forbidden heading="Usuarios" onRetry={load} />;

  function submit(event: FormEvent) {
    event.preventDefault();
    const issue = queryProblem(draft);
    setProblem(issue);
    if (issue) return;
    setOffset(0);
    setApplied({ q: draft, verified: draftVerified });
  }

  return (
    <section>
      <h1>Usuarios</h1>
      <p style={{ color: "#555", maxWidth: "70ch" }}>
        Consulta de solo lectura. Nunca se muestran contraseñas, sesiones, documentos ni los datos de las viviendas. Cada búsqueda y cada ficha abierta
        queda en la auditoría con quién la hizo (no se guarda lo que se buscó).
      </p>
      <form onSubmit={submit} aria-label="Buscar personas" style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", alignItems: "end", marginBottom: 16 }}>
        <label style={labelStyle}>Correo contiene
          <input style={fillStyle} value={draft} maxLength={120} autoComplete="off" aria-invalid={problem ? true : undefined} aria-describedby={problem ? "q-problem" : undefined}
                 onChange={(e) => { setDraft(e.target.value); setProblem(null); }} />
        </label>
        <label style={labelStyle}>Correo verificado
          <select style={fillStyle} value={draftVerified} onChange={(e) => setDraftVerified(e.target.value as VerifiedFilter)}>
            <option value="">Todos</option><option value="yes">Verificado</option><option value="no">Sin verificar</option>
          </select>
        </label>
        <div><button type="submit" style={controlStyle}>Buscar</button></div>
      </form>
      {problem ? <p id="q-problem" role="alert" style={{ color: "#b00020" }}>{problem}</p> : null}
      {state.status === "loading" ? <Loading /> : state.status === "error" ? <ErrorView message={state.message} onRetry={load} />
        : state.page.items.length === 0 ? <Empty>No hay personas con estos criterios.</Empty> : (
          <>
            <ScrollRegion label="Personas"><table>
              <caption style={{ textAlign: "left", padding: "4px 0" }}>Mostrando {offset + 1}–{offset + state.page.items.length} de {state.page.total}</caption>
              <thead><tr><th scope="col">Correo</th><th scope="col">Verificado</th><th scope="col">Viviendas</th><th scope="col">Sesiones activas</th><th scope="col">Rol administrativo</th><th scope="col">Alta</th></tr></thead>
              <tbody>
                {state.page.items.map((u) => (
                  <tr key={u.id}>
                    <td><Link href={`/usuarios/${u.id}`} style={linkStyle}>{u.email}</Link></td>
                    <td>{u.email_verified ? "Sí" : "No"}</td><td>{u.homes}</td><td>{u.active_sessions}</td>
                    <td>{u.admin_roles.length ? u.admin_roles.map(roleLabel).join(", ") : "—"}</td><td>{formatDate(u.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table></ScrollRegion>
            <nav aria-label="Paginación de personas" style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button style={controlStyle} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - USERS_PAGE_SIZE))}>Anterior</button>
              <button style={controlStyle} disabled={offset + USERS_PAGE_SIZE >= state.page.total} onClick={() => setOffset(offset + USERS_PAGE_SIZE)}>Siguiente</button>
            </nav>
          </>
        )}
    </section>
  );
}
