"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { hasScope } from "@/lib/access";
import { ErrorView, Forbidden, Loading } from "@/components/StateViews";
import { ScrollRegion } from "@/components/ScrollRegion";
import { controlStyle } from "@/lib/controls";
import { healthRows, nf, seriesTotal, sparkPoints, STATUS_TEXT, type Overview, type Status, type TrendPoint } from "@/lib/overview";

type State = { status: "loading" } | { status: "ok"; data: Overview } | { status: "forbidden" } | { status: "error"; message: string };

const COLORS: Record<Status, { fg: string; bg: string }> = {
  ok: { fg: "#0b5d2a", bg: "#e3f4e8" }, warning: { fg: "#7a4a00", bg: "#fff1d6" }, off: { fg: "#444", bg: "#ececec" },
};
const grid = { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", margin: "0 0 16px", padding: 0, listStyle: "none" } as const;
const card = { border: "1px solid #ddd", borderRadius: 8, padding: 12, minWidth: 0 } as const;

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <li style={card}>
      <p style={{ margin: 0, fontSize: 13, color: "#555" }}>{label}</p>
      <p style={{ margin: "4px 0 0", fontSize: 26, fontWeight: 700 }}>{value}</p>
      {note ? <p style={{ margin: "4px 0 0", fontSize: 12, color: "#555" }}>{note}</p> : null}
    </li>
  );
}

function Trend({ title, series, unit }: { title: string; series: TrendPoint[]; unit: string }) {
  const total = seriesTotal(series);
  return (
    <figure style={{ ...card, margin: 0 }}>
      <figcaption style={{ fontWeight: 600 }}>{title}</figcaption>
      <p style={{ margin: "2px 0 8px", fontSize: 13, color: "#555" }}>{nf(total)} {unit} en {series.length} días</p>
      <svg viewBox="0 0 200 44" width="100%" height="44" role="img" aria-label={`${title}: ${nf(total)} ${unit} en ${series.length} días. Los datos están en la tabla de abajo.`} preserveAspectRatio="none">
        <polyline fill="none" stroke="#1f4fbf" strokeWidth="2" vectorEffect="non-scaling-stroke" points={sparkPoints(series, 200, 44)} />
      </svg>
      <details style={{ marginTop: 8 }}>
        <summary style={{ cursor: "pointer", minHeight: 24 }}>Ver datos</summary>
        <ScrollRegion label={`Datos: ${title}`}>
          <table>
            <thead><tr><th scope="col">Día</th><th scope="col">{unit}</th></tr></thead>
            <tbody>{series.map(p => <tr key={p.day}><td>{p.day}</td><td>{nf(p.value)}</td></tr>)}</tbody>
          </table>
        </ScrollRegion>
      </details>
    </figure>
  );
}

export default function ResumenPage() {
  const { access } = useSession();
  const [state, setState] = useState<State>({ status: "loading" });
  const load = useCallback(async () => {
    setState({ status: "loading" });
    try { setState({ status: "ok", data: await apiFetch<Overview>("/api/v1/admin/overview") }); }
    catch (err) {
      if (err instanceof ApiError && err.status === 403) setState({ status: "forbidden" });
      else setState({ status: "error", message: err instanceof Error ? err.message : "Error desconocido" });
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (state.status === "forbidden") return <Forbidden heading="Resumen" onRetry={load} />;
  if (state.status === "loading") return <Loading />;
  if (state.status === "error") return <ErrorView message={state.message} onRetry={load} />;
  const o = state.data;
  const rows = healthRows(o);
  const canOcr = hasScope(access, "admin.ocr.read");
  const when = new Date(o.generated_at).toLocaleString("es-DO", { timeZone: "America/Santo_Domingo" });

  return (
    <section>
      <h1>Resumen</h1>
      <p style={{ color: "#555", maxWidth: "70ch" }}>
        Cifras agregadas de la plataforma, sin datos de ninguna persona ni vivienda. Actualizado: {when}.{" "}
        <button style={controlStyle} onClick={() => void load()}>Actualizar</button>
      </p>

      <h2>Plataforma</h2>
      <ul style={grid} aria-label="Cifras de la plataforma">
        <Stat label="Personas registradas" value={nf(o.users.total)} note={`${nf(o.users.verified)} con correo verificado · ${nf(o.users.new_recent)} nuevas en ${o.window_days} días`} />
        <Stat label="Sesiones activas" value={nf(o.users.active_sessions)} />
        <Stat label="Viviendas" value={nf(o.homes.total)} />
        <Stat label="Facturas" value={nf(o.bills.total)} note={`${nf(o.bills.recent)} nuevas en ${o.window_days} días`} />
        <Stat label="Alertas sin leer" value={nf(o.alerts.unread)} />
        <Stat label="Apagones registrados" value={nf(o.outages.recent)} note={`en ${o.window_days} días`} />
      </ul>

      <h2>Cola de trabajos</h2>
      <ul style={grid} aria-label="Cola de trabajos">
        <Stat label="En cola" value={nf(o.jobs.queued)} note={o.jobs.oldest_wait_minutes ? `El más viejo espera ${o.jobs.oldest_wait_minutes} min` : undefined} />
        <Stat label="En curso" value={nf(o.jobs.running)} />
        <Stat label="Agotaron intentos" value={nf(o.jobs.dead)} note="Dead-letter" />
        <Stat label="OCR pendiente" value={nf(o.jobs.ocr_queued + o.jobs.ocr_running)} note={`${nf(o.jobs.ocr_dead)} fallidos sin reintento`} />
      </ul>
      {canOcr ? <p><Link href="/ocr">Ver trabajos OCR</Link></p> : null}

      <h2>Salud de los servicios</h2>
      <ScrollRegion label="Salud de los servicios">
        <table>
          <thead><tr><th scope="col">Servicio</th><th scope="col">Estado</th><th scope="col">Detalle</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.label}>
                <th scope="row" style={{ textAlign: "left" }}>{r.label}</th>
                <td><span style={{ ...COLORS[r.status], padding: "2px 8px", borderRadius: 12, fontSize: 13, fontWeight: 600 }}>{STATUS_TEXT[r.status]}</span></td>
                <td>{r.value}{r.hint ? <span style={{ display: "block", fontSize: 12, color: "#555" }}>{r.hint}</span> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollRegion>

      <h2>Copilot hoy</h2>
      <ul style={grid} aria-label="Uso del Copilot hoy">
        <Stat label="Preguntas" value={nf(o.copilot.messages_today)} />
        <Stat label="Personas" value={nf(o.copilot.people_today)} />
        <Stat label="Tokens" value={nf(o.copilot.tokens_today)} />
      </ul>

      <h2>Tendencias ({o.window_days} días)</h2>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))" }}>
        <Trend title="Personas nuevas" series={o.trends.new_users} unit="personas" />
        <Trend title="Facturas nuevas" series={o.trends.new_bills} unit="facturas" />
        <Trend title="Preguntas al Copilot" series={o.trends.copilot_messages} unit="preguntas" />
      </div>
    </section>
  );
}
