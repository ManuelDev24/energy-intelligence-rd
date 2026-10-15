"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { Empty, ErrorView, Forbidden, Loading } from "@/components/StateViews";
import { ScrollRegion } from "@/components/ScrollRegion";
import { controlStyle, fillStyle } from "@/lib/controls";
import { formatDate } from "@/lib/ocr";
import { buildHomesQuery, DISTRIBUTORS, HOMES_PAGE_SIZE, homeQueryProblem, type AdminHomesPage, type DistributorFilter } from "@/lib/homes";

type State = { status: "loading" } | { status: "ok"; page: AdminHomesPage } | { status: "forbidden" } | { status: "error"; message: string };
const labelStyle = { display: "grid", gap: 4, fontSize: 14 } as const;
const linkStyle = { display: "inline-block", minHeight: 24, padding: "4px 0", boxSizing: "border-box" } as const;

export default function ViviendasPage() {
  const [draft, setDraft] = useState("");
  const [draftDistributor, setDraftDistributor] = useState<DistributorFilter>("");
  const [applied, setApplied] = useState<{ q: string; distributor: DistributorFilter }>({ q: "", distributor: "" });
  const [offset, setOffset] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      setState({ status: "ok", page: await apiFetch<AdminHomesPage>(`/api/v1/admin/homes${buildHomesQuery(applied.q, applied.distributor, offset)}`) });
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setState({ status: "forbidden" });
      else setState({ status: "error", message: err instanceof Error ? err.message : "Error desconocido" });
    }
  }, [applied, offset]);
  useEffect(() => { void load(); }, [load]);

  if (state.status === "forbidden") return <Forbidden heading="Viviendas" onRetry={load} />;

  function submit(event: FormEvent) {
    event.preventDefault();
    const issue = homeQueryProblem(draft);
    setProblem(issue);
    if (issue) return;
    setOffset(0);
    setApplied({ q: draft.trim(), distributor: draftDistributor });
  }

  return (
    <section>
      <h1>Viviendas</h1>
      <p style={{ color: "#555", maxWidth: "70ch" }}>
        Consulta de solo lectura para soporte y operación. Solo se muestran identificadores, distribuidora, provincia y conteos: nunca el nombre,
        la dirección ni quiénes son los miembros. Cada consulta y cada ficha abierta queda en la auditoría con quién la hizo (no se guarda lo que se buscó).
      </p>
      <form onSubmit={submit} aria-label="Buscar viviendas" style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", alignItems: "end", marginBottom: 16 }}>
        <label style={labelStyle}>Código o identificador
          <input style={fillStyle} value={draft} maxLength={64} autoComplete="off" aria-invalid={problem ? true : undefined} aria-describedby={problem ? "q-problem" : undefined}
                 onChange={(e) => { setDraft(e.target.value); setProblem(null); }} />
        </label>
        <label style={labelStyle}>Distribuidora
          <select style={fillStyle} value={draftDistributor} onChange={(e) => setDraftDistributor(e.target.value as DistributorFilter)}>
            <option value="">Todas</option>
            {DISTRIBUTORS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <div><button type="submit" style={controlStyle}>Buscar</button></div>
      </form>
      {problem ? <p id="q-problem" role="alert" style={{ color: "#b00020" }}>{problem}</p> : null}
      {state.status === "loading" ? <Loading /> : state.status === "error" ? <ErrorView message={state.message} onRetry={load} />
        : state.page.items.length === 0 ? <Empty>No hay viviendas con estos criterios.</Empty> : (
          <>
            <ScrollRegion label="Viviendas"><table>
              <caption style={{ textAlign: "left", padding: "4px 0" }}>Mostrando {offset + 1}–{offset + state.page.items.length} de {state.page.total}</caption>
              <thead><tr><th scope="col">Vivienda</th><th scope="col">Distribuidora</th><th scope="col">Provincia</th><th scope="col">Miembros</th><th scope="col">Facturas</th><th scope="col">Última factura</th><th scope="col">Reclamaciones abiertas</th><th scope="col">Alta</th></tr></thead>
              <tbody>
                {state.page.items.map((h) => (
                  <tr key={h.id}>
                    <td><Link href={`/viviendas/${h.id}`} style={linkStyle}>{h.code ?? `${h.id.slice(0, 8)}…`}</Link></td>
                    <td>{h.distributor}</td><td>{h.province ?? "—"}</td><td>{h.members}</td><td>{h.bills}</td>
                    <td>{formatDate(h.last_bill_end)}</td><td>{h.open_claims}</td><td>{formatDate(h.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table></ScrollRegion>
            <nav aria-label="Paginación de viviendas" style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button style={controlStyle} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - HOMES_PAGE_SIZE))}>Anterior</button>
              <button style={controlStyle} disabled={offset + HOMES_PAGE_SIZE >= state.page.total} onClick={() => setOffset(offset + HOMES_PAGE_SIZE)}>Siguiente</button>
            </nav>
          </>
        )}
    </section>
  );
}
