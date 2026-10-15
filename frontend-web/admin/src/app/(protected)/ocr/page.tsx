"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { Empty, ErrorView, Forbidden, Loading } from "@/components/StateViews";
import { ScrollRegion } from "@/components/ScrollRegion";
import { controlStyle, fillStyle } from "@/lib/controls";
import {
  buildJobsQuery, EMPTY_FILTERS, ERROR_CODES, ERROR_LABELS, formatDate, PAGE_SIZE, STATUS_LABELS,
  type OcrErrorCode, type OcrFilters, type OcrJobsPage, type OcrStatus,
} from "@/lib/ocr";

type State =
  | { status: "loading" }
  | { status: "ok"; page: OcrJobsPage }
  | { status: "forbidden" }
  | { status: "error"; message: string };

const labelStyle = { display: "grid", gap: 4, fontSize: 14 } as const;
/** Enlaces en filas contiguas: 24 px de alto como mínimo (WCAG 2.5.8; axe `target-size`). */
const rowLinkStyle = { display: "inline-block", minHeight: 24, padding: "4px 0", boxSizing: "border-box" } as const;

export default function OcrJobsPage() {
  const [draft, setDraft] = useState<OcrFilters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<OcrFilters>(EMPTY_FILTERS);
  const [offset, setOffset] = useState(0);
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const page = await apiFetch<OcrJobsPage>(`/api/v1/admin/ocr/jobs${buildJobsQuery(filters, offset)}`);
      setState({ status: "ok", page });
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setState({ status: "forbidden" });
      else setState({ status: "error", message: err instanceof Error ? err.message : "Error desconocido" });
    }
  }, [filters, offset]);

  useEffect(() => { void load(); }, [load]);

  if (state.status === "forbidden") return <Forbidden heading="Trabajos OCR" onRetry={load} />;

  function apply(event: FormEvent) {
    event.preventDefault();
    setOffset(0);
    setFilters({ ...draft });
  }
  function clear() {
    setDraft(EMPTY_FILTERS);
    setOffset(0);
    setFilters(EMPTY_FILTERS);
  }
  const set = <K extends keyof OcrFilters>(key: K, value: OcrFilters[K]) => setDraft((d) => ({ ...d, [key]: value }));

  return (
    <section>
      <h1>Trabajos OCR</h1>
      <p style={{ color: "#555", maxWidth: "70ch" }}>
        Cola de lectura de facturas. Esta consola no muestra el contenido de los documentos ni permite confirmar
        facturas en nombre de nadie: solo diagnosticar, reintentar o cancelar, siempre con motivo y auditoría.
      </p>
      <form onSubmit={apply} aria-label="Filtros de trabajos OCR"
            style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))", alignItems: "end", marginBottom: 16 }}>
        <label style={labelStyle}>Estado
          <select style={fillStyle} value={draft.status} onChange={(e) => set("status", e.target.value as OcrStatus | "")}>
            <option value="">Todos</option>
            {(Object.keys(STATUS_LABELS) as OcrStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </label>
        <label style={labelStyle}>Error
          <select style={fillStyle} value={draft.errorCode} onChange={(e) => set("errorCode", e.target.value as OcrErrorCode | "")}>
            <option value="">Cualquiera</option>
            {ERROR_CODES.map((c) => <option key={c} value={c}>{ERROR_LABELS[c]}</option>)}
          </select>
        </label>
        <label style={labelStyle}>Intentos mínimos
          <input style={fillStyle} type="number" min={0} max={100} inputMode="numeric" value={draft.minAttempts}
                 onChange={(e) => set("minAttempts", e.target.value)} />
        </label>
        <label style={labelStyle}>Creado desde
          <input style={fillStyle} type="date" value={draft.from} onChange={(e) => set("from", e.target.value)} />
        </label>
        <label style={labelStyle}>Creado hasta
          <input style={fillStyle} type="date" value={draft.to} onChange={(e) => set("to", e.target.value)} />
        </label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="submit" style={controlStyle}>Aplicar filtros</button>
          <button type="button" style={controlStyle} onClick={clear}>Limpiar</button>
        </div>
      </form>
      {state.status === "loading" ? <Loading /> : state.status === "error" ? <ErrorView message={state.message} onRetry={load} />
        : state.page.items.length === 0 ? (
          <Empty>{state.page.total === 0 && offset === 0 ? "No hay trabajos OCR con estos filtros." : "No hay más resultados."}</Empty>
        ) : (
          <>
            <ScrollRegion label="Trabajos OCR"><table>
              <caption style={{ textAlign: "left", padding: "4px 0" }}>
                Mostrando {offset + 1}–{offset + state.page.items.length} de {state.page.total}
              </caption>
              <thead>
                <tr><th scope="col">Trabajo</th><th scope="col">Estado</th><th scope="col">Intentos</th><th scope="col">Error</th>
                  <th scope="col">Creado</th><th scope="col">Terminado</th></tr>
              </thead>
              <tbody>
                {state.page.items.map((job) => (
                  <tr key={job.id}>
                    <td><Link href={`/ocr/${job.id}`} style={rowLinkStyle}>Trabajo #{job.id}</Link></td>
                    <td>{STATUS_LABELS[job.status] ?? job.status}</td>
                    <td>{job.attempts} de {job.max_attempts}</td>
                    <td>{job.error_code ? ERROR_LABELS[job.error_code] ?? job.error_code : "—"}</td>
                    <td>{formatDate(job.created_at)}</td>
                    <td>{formatDate(job.finished_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table></ScrollRegion>
            <nav aria-label="Paginación de trabajos OCR" style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button style={controlStyle} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>Anterior</button>
              <button style={controlStyle} disabled={offset + PAGE_SIZE >= state.page.total} onClick={() => setOffset(offset + PAGE_SIZE)}>Siguiente</button>
            </nav>
          </>
        )}
    </section>
  );
}
