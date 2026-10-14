"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { ErrorView, Forbidden, Loading } from "@/components/StateViews";
import { ScrollRegion } from "@/components/ScrollRegion";
import { controlStyle, fillStyle } from "@/lib/controls";
import {
  canCancel, canRetry, ERROR_LABELS, formatBytes, formatDate, historyLabel, ocrSourceText, reasonProblem,
  REASON_REJECTED, STATUS_LABELS, type OcrJobDetail,
} from "@/lib/ocr";

type State =
  | { status: "loading" }
  | { status: "ok"; job: OcrJobDetail }
  | { status: "forbidden" }
  | { status: "missing" }
  | { status: "error"; message: string };

const KIND_LABELS: Record<string, string> = { bill_photo: "Foto de factura", bill_pdf: "PDF de factura" };
const VIA_LABELS: Record<string, string> = { web: "Web", mobile: "App móvil", api: "API" };

export default function OcrJobPage() {
  const params = useParams<{ id: string }>();
  const id = /^[1-9]\d{0,18}$/.test(params.id ?? "") ? params.id : null;
  const { access } = useSession();
  const [state, setState] = useState<State>({ status: "loading" });
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) { setState({ status: "missing" }); return; }
    setState({ status: "loading" });
    try {
      setState({ status: "ok", job: await apiFetch<OcrJobDetail>(`/api/v1/admin/ocr/jobs/${id}`) });
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setState({ status: "forbidden" });
      else if (err instanceof ApiError && err.status === 404) setState({ status: "missing" });
      else setState({ status: "error", message: err instanceof Error ? err.message : "Error desconocido" });
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  if (state.status === "forbidden") return <Forbidden heading="Trabajo OCR" onRetry={load} />;
  if (state.status === "loading") return <Loading />;
  if (state.status === "error") return <ErrorView message={state.message} onRetry={load} />;
  if (state.status === "missing") {
    return (
      <section>
        <h1>Trabajo OCR</h1>
        <p role="alert">Este trabajo no existe o ya no está disponible.</p>
        <Link href="/ocr">Volver a los trabajos OCR</Link>
      </section>
    );
  }

  const { job } = state;
  const done = (updated: OcrJobDetail, message: string) => { setState({ status: "ok", job: updated }); setNotice(message); };
  const rows: Array<[string, string]> = [
    ["Estado", STATUS_LABELS[job.status] ?? job.status],
    ["Intentos", `${job.attempts} de ${job.max_attempts}`],
    ["Generación", String(job.generation)],
    ["Error", job.error_code ? ERROR_LABELS[job.error_code] ?? job.error_code : "—"],
    ["Lectura", ocrSourceText(job) || "Aún sin lectura"],
    ["Motor", job.engine ?? "—"],
    ["Creado", formatDate(job.created_at)],
    ["Próxima ejecución", formatDate(job.run_at)],
    ["Iniciado", formatDate(job.started_at)],
    ["Terminado", formatDate(job.finished_at)],
    ["Documento", `${KIND_LABELS[job.document_kind] ?? job.document_kind} · ${job.document_content_type} · ${formatBytes(job.document_size_bytes)}`],
    ["Subido desde", VIA_LABELS[job.uploaded_via] ?? job.uploaded_via],
    ["Factura", job.attached_to_bill ? "Ya confirmada por la persona usuaria" : "Sin confirmar"],
  ];

  return (
    <section>
      <p><Link href="/ocr">← Trabajos OCR</Link></p>
      <h1>Trabajo OCR #{job.id}</h1>
      <p role="status" aria-live="polite" style={{ minHeight: "1.5em", color: "#0a5c2f" }}>{notice}</p>
      <dl style={{ display: "grid", gridTemplateColumns: "minmax(0, max-content) minmax(0, 1fr)", gap: "6px 16px", margin: "0 0 16px" }}>
        {rows.map(([term, value]) => (
          <div key={term} style={{ display: "contents" }}>
            <dt style={{ fontWeight: 600 }}>{term}</dt>
            <dd style={{ margin: 0, overflowWrap: "anywhere" }}>{value}</dd>
          </div>
        ))}
      </dl>
      <p style={{ color: "#555", maxWidth: "70ch" }}>
        Por privacidad, la consola no muestra la imagen, el texto ni los campos leídos de la factura, y no permite confirmarla:
        eso solo lo hace la persona usuaria desde su app.
      </p>

      {canRetry(job, access) ? (
        <ReasonAction key={`retry-${job.generation}`} title="Reintentar lectura" submit="Reintentar"
          description="Vuelve a poner el trabajo en cola desde el intento 0. Úsalo cuando el fallo fue del motor, no del archivo."
          onSubmit={async (reason) => done(await apiFetch<OcrJobDetail>(`/api/v1/admin/ocr/jobs/${job.id}/retry`,
            { method: "POST", body: JSON.stringify({ reason }) }), "Trabajo puesto de nuevo en cola.")} />
      ) : null}
      {canCancel(job, access) ? (
        <ReasonAction key={`cancel-${job.generation}`} title="Cancelar trabajo" submit="Cancelar trabajo…" confirm
          description="Detiene la lectura y descarta cualquier resultado parcial. La persona podrá volver a pedirla desde su app."
          onSubmit={async (reason) => done(await apiFetch<OcrJobDetail>(`/api/v1/admin/ocr/jobs/${job.id}/cancel`,
            { method: "POST", body: JSON.stringify({ reason }) }), "Trabajo cancelado.")} />
      ) : null}

      <h2>Historial de operaciones</h2>
      {job.history.length === 0 ? <p>Sin operaciones manuales.</p> : (
        <ScrollRegion label="Historial de operaciones"><table>
          <thead><tr><th scope="col">Fecha</th><th scope="col">Operación</th><th scope="col">Resultado</th><th scope="col">Motivo</th></tr></thead>
          <tbody>
            {job.history.map((h, index) => (
              <tr key={`${h.created_at}-${index}`}>
                <td>{formatDate(h.created_at)}</td><td>{historyLabel(h.action)}</td><td>{h.result}</td><td>{h.reason ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table></ScrollRegion>
      )}
    </section>
  );
}

function ReasonAction({ title, description, submit, confirm = false, onSubmit }: {
  title: string; description: string; submit: string; confirm?: boolean; onSubmit: (reason: string) => Promise<void>;
}) {
  const inputId = useId();
  const errorId = useId();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    setError(null);
    try { await onSubmit(reason.trim()); }
    catch (err) {
      setConfirming(false);
      setError(err instanceof ApiError && err.status === 422 ? REASON_REJECTED : err instanceof Error ? err.message : "No se pudo completar la operación.");
    } finally { setBusy(false); }
  }
  function start(event: FormEvent) {
    event.preventDefault();
    const problem = reasonProblem(reason);
    if (problem) { setError(problem); return; }
    if (confirm) setConfirming(true);
    else void send();
  }

  return (
    <form onSubmit={start} aria-labelledby={`${inputId}-title`} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, margin: "0 0 16px", maxWidth: 560 }}>
      <h2 id={`${inputId}-title`} style={{ fontSize: 18, margin: "0 0 4px" }}>{title}</h2>
      <p style={{ margin: "0 0 8px", color: "#555" }}>{description}</p>
      <label htmlFor={inputId} style={{ display: "block", marginBottom: 4 }}>Motivo (obligatorio)</label>
      <input id={inputId} style={fillStyle} value={reason} maxLength={500} disabled={busy || confirming}
             aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined}
             onChange={(e) => { setReason(e.target.value); setError(null); }} />
      {error ? <p id={errorId} role="alert" style={{ color: "#b00020", margin: "6px 0 0" }}>{error}</p> : null}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        {confirming ? (
          <>
            <p style={{ flexBasis: "100%", margin: 0 }} role="alert">¿Seguro? Esta acción queda registrada en la auditoría.</p>
            <button type="button" style={controlStyle} disabled={busy} onClick={() => void send()}>Sí, confirmar</button>
            <button type="button" style={controlStyle} disabled={busy} onClick={() => setConfirming(false)}>No, volver</button>
          </>
        ) : <button type="submit" style={controlStyle} disabled={busy}>{busy ? "Enviando…" : submit}</button>}
      </div>
    </form>
  );
}
