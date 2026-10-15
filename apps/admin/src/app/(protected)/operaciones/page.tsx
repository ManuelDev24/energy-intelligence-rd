"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { Empty, ErrorView, Forbidden, Loading } from "@/components/StateViews";
import { ScrollRegion } from "@/components/ScrollRegion";
import { controlStyle, fillStyle, visuallyHidden } from "@/lib/controls";
import { formatDate } from "@/lib/ocr";
import { nf } from "@/lib/overview";
import {
  ATTENTION_TEXT, buildJobsQuery, JOBS_PAGE_SIZE, kindAttention, STATUS_OPTIONS, statusLabel, worstAttention,
  type AdminJobsPage, type Attention, type JobsSummary, type JobStatus,
} from "@/lib/jobs";

type Summary = { status: "loading" } | { status: "ok"; data: JobsSummary } | { status: "forbidden" } | { status: "error"; message: string };
type Listing = { status: "loading" } | { status: "ok"; page: AdminJobsPage } | { status: "error"; message: string };
const COLORS: Record<Attention, { fg: string; bg: string }> = { ok: { fg: "#0b5d2a", bg: "#e3f4e8" }, warning: { fg: "#7a4a00", bg: "#fff1d6" }, critical: { fg: "#8a0017", bg: "#fde3e7" } };
const labelStyle = { display: "grid", gap: 4, fontSize: 14 } as const;

export default function OperacionesPage() {
  const [summary, setSummary] = useState<Summary>({ status: "loading" });
  const [draftKind, setDraftKind] = useState("");
  const [draftStatus, setDraftStatus] = useState<"" | JobStatus>("");
  const [applied, setApplied] = useState<{ kind: string; status: "" | JobStatus }>({ kind: "", status: "" });
  const [offset, setOffset] = useState(0);
  const [listing, setListing] = useState<Listing>({ status: "loading" });

  const loadSummary = useCallback(async () => {
    setSummary({ status: "loading" });
    try { setSummary({ status: "ok", data: await apiFetch<JobsSummary>("/api/v1/admin/jobs/summary") }); }
    catch (err) {
      if (err instanceof ApiError && err.status === 403) setSummary({ status: "forbidden" });
      else setSummary({ status: "error", message: err instanceof Error ? err.message : "Error desconocido" });
    }
  }, []);
  const loadList = useCallback(async () => {
    setListing({ status: "loading" });
    try { setListing({ status: "ok", page: await apiFetch<AdminJobsPage>(`/api/v1/admin/jobs${buildJobsQuery(applied.kind, applied.status, offset)}`) }); }
    catch (err) { setListing({ status: "error", message: err instanceof Error ? err.message : "Error desconocido" }); }
  }, [applied, offset]);
  useEffect(() => { void loadSummary(); }, [loadSummary]);
  useEffect(() => { if (summary.status === "ok") void loadList(); }, [summary.status, loadList]);

  if (summary.status === "forbidden") return <Forbidden heading="Operaciones" onRetry={loadSummary} />;

  function submit(event: FormEvent) {
    event.preventDefault();
    setOffset(0);
    setApplied({ kind: draftKind, status: draftStatus });
  }

  return (
    <section>
      <h1>Operaciones</h1>
      <p style={{ color: "#555", maxWidth: "70ch" }}>
        Estado de los trabajos en segundo plano (correos, OCR, revisiones de anomalías y alertas, mantenimiento). Solo lectura: nunca se muestran los datos
        de cada trabajo ni el texto de sus errores, que pueden contener información personal. Para reintentar o cancelar lecturas de facturas usa «OCR».
      </p>
      {summary.status === "loading" ? <Loading /> : summary.status === "error" ? <ErrorView message={summary.message} onRetry={loadSummary} /> : (
        <>
          {worstAttention(summary.data.kinds) !== "ok" ? (
            <p role="alert" style={{ background: COLORS[worstAttention(summary.data.kinds)].bg, color: COLORS[worstAttention(summary.data.kinds)].fg, padding: 12, borderRadius: 8 }}>
              {worstAttention(summary.data.kinds) === "critical" ? "Hay trabajos vencidos y nada en curso: el worker podría estar detenido." : "Hay trabajos muertos en las últimas 24 h o con retraso."}
            </p>
          ) : null}
          <h2>Por tipo de trabajo</h2>
          {summary.data.kinds.length === 0 ? <Empty>Todavía no se ha encolado ningún trabajo.</Empty> : (
            <ScrollRegion label="Trabajos por tipo"><table>
              <thead><tr><th scope="col">Tipo</th><th scope="col">Estado</th><th scope="col">En cola</th><th scope="col">En curso</th><th scope="col">Muertos</th><th scope="col">Terminados 24 h</th><th scope="col">Muertos 24 h</th><th scope="col">Último terminado</th></tr></thead>
              <tbody>{summary.data.kinds.map((k) => {
                const a = kindAttention(k);
                return (
                  <tr key={k.kind}>
                    <td>{k.kind}</td>
                    <td><span style={{ background: COLORS[a.level].bg, color: COLORS[a.level].fg, padding: "2px 8px", borderRadius: 999, fontWeight: 600 }}>{ATTENTION_TEXT[a.level]}</span>
                      {a.reasons.length ? <><br /><small>{a.reasons.join("; ")}</small></> : <span style={visuallyHidden}> sin novedades</span>}</td>
                    <td>{nf(k.queued)}</td><td>{nf(k.running)}</td><td>{nf(k.dead)}</td><td>{nf(k.succeeded_24h)}</td><td>{nf(k.dead_24h)}</td><td>{formatDate(k.last_finished_at)}</td>
                  </tr>
                );
              })}</tbody>
            </table></ScrollRegion>
          )}
          <h2>Trabajos</h2>
          <form onSubmit={submit} aria-label="Filtrar trabajos" style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", alignItems: "end", marginBottom: 16 }}>
            <label style={labelStyle}>Tipo
              <select style={fillStyle} value={draftKind} onChange={(e) => setDraftKind(e.target.value)}>
                <option value="">Todos</option>
                {summary.data.kinds.map((k) => <option key={k.kind} value={k.kind}>{k.kind}</option>)}
              </select>
            </label>
            <label style={labelStyle}>Estado
              <select style={fillStyle} value={draftStatus} onChange={(e) => setDraftStatus(e.target.value as "" | JobStatus)}>
                {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <div><button type="submit" style={controlStyle}>Filtrar</button></div>
          </form>
          {listing.status === "loading" ? <Loading /> : listing.status === "error" ? <ErrorView message={listing.message} onRetry={loadList} />
            : listing.page.items.length === 0 ? <Empty>No hay trabajos con estos criterios.</Empty> : (
              <>
                <ScrollRegion label="Lista de trabajos"><table>
                  <caption style={{ textAlign: "left", padding: "4px 0" }}>Mostrando {offset + 1}–{offset + listing.page.items.length} de {listing.page.total}</caption>
                  <thead><tr><th scope="col">N.º</th><th scope="col">Tipo</th><th scope="col">Estado</th><th scope="col">Intentos</th><th scope="col">Programado</th><th scope="col">Terminó</th><th scope="col">Error</th></tr></thead>
                  <tbody>{listing.page.items.map((j) => (
                    <tr key={j.id}>
                      <td>{j.id}</td><td>{j.kind}</td><td>{statusLabel(j.status)}{j.overdue ? " (con retraso)" : ""}</td><td>{j.attempts} de {j.max_attempts}</td>
                      <td>{formatDate(j.run_at)}</td><td>{formatDate(j.finished_at)}</td><td>{j.has_error ? "Sí (texto oculto)" : "No"}</td>
                    </tr>
                  ))}</tbody>
                </table></ScrollRegion>
                <nav aria-label="Paginación de trabajos" style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button style={controlStyle} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - JOBS_PAGE_SIZE))}>Anterior</button>
                  <button style={controlStyle} disabled={offset + JOBS_PAGE_SIZE >= listing.page.total} onClick={() => setOffset(offset + JOBS_PAGE_SIZE)}>Siguiente</button>
                </nav>
              </>
            )}
        </>
      )}
    </section>
  );
}
