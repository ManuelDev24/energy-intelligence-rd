"use client";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { ErrorView, Forbidden, Loading } from "@/components/StateViews";
import { ScrollRegion } from "@/components/ScrollRegion";
import { formatDate } from "@/lib/ocr";
import { ATTESTATION_TEXT, attestationText, CHECK_TEXT, counts, migrationsText, overall, uptimeText, type CheckStatus, type Overall, type SystemStatus } from "@/lib/system";

type State = { status: "loading" } | { status: "ok"; data: SystemStatus } | { status: "forbidden" } | { status: "error"; message: string };
const COLORS: Record<CheckStatus | Overall, { fg: string; bg: string }> = {
  ok: { fg: "#0b5d2a", bg: "#e3f4e8" }, warning: { fg: "#7a4a00", bg: "#fff1d6" }, missing: { fg: "#8a0017", bg: "#fde3e7" }, critical: { fg: "#8a0017", bg: "#fde3e7" }, na: { fg: "#444", bg: "#ececec" },
};
const pill = (status: CheckStatus | Overall) => ({ background: COLORS[status].bg, color: COLORS[status].fg, padding: "2px 8px", borderRadius: 999, fontWeight: 600 }) as const;

export default function SistemaPage() {
  const [state, setState] = useState<State>({ status: "loading" });
  const load = useCallback(async () => {
    setState({ status: "loading" });
    try { setState({ status: "ok", data: await apiFetch<SystemStatus>("/api/v1/admin/system") }); }
    catch (err) {
      if (err instanceof ApiError && err.status === 403) setState({ status: "forbidden" });
      else setState({ status: "error", message: err instanceof Error ? err.message : "Error desconocido" });
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (state.status === "forbidden") return <Forbidden heading="Sistema" onRetry={load} />;
  return (
    <section>
      <h1>Sistema</h1>
      <p style={{ color: "#555", maxWidth: "70ch" }}>
        Configuración y salud de la plataforma. Solo se muestra si cada ajuste cumple lo que la aplicación exige, con el nombre de la variable de entorno:
        nunca sus valores, claves ni direcciones. Para la cola de trabajos y el worker usa «Operaciones».
      </p>
      {state.status === "loading" ? <Loading /> : state.status === "error" ? <ErrorView message={state.message} onRetry={load} /> : (() => {
        const s = state.data;
        const level = overall(s);
        const c = counts(s.checks);
        return (
          <>
            <p role={level === "ok" ? "status" : "alert"} style={{ ...pill(level), display: "block", padding: 12, borderRadius: 8 }}>
              {level === "ok" ? "Todo en orden según lo que se puede comprobar."
                : level === "critical" ? `Hay ajustes que faltan (${c.missing}) o migraciones pendientes. Revisa la lista de abajo.`
                  : "Nada crítico, pero hay puntos que revisar (avisos, fechas sin declarar o vencidas, o algo que no se pudo verificar)."}
            </p>
            <h2>Versión y arranque</h2>
            <ScrollRegion label="Versión y arranque"><table>
              <thead><tr><th scope="col">Dato</th><th scope="col">Valor</th></tr></thead>
              <tbody>
                <tr><td>Entorno</td><td>{s.environment}</td></tr>
                <tr><td>Versión de la API</td><td>{s.version}</td></tr>
                <tr><td>Versión desplegada (commit)</td><td>{s.release ?? "No informada por la plataforma"}</td></tr>
                <tr><td>En marcha desde</td><td>{formatDate(s.started_at)} ({uptimeText(s.uptime_seconds)})</td></tr>
                <tr><td>Migraciones</td><td>{migrationsText(s.migrations)}</td></tr>
              </tbody>
            </table></ScrollRegion>

            <h2>Configuración ({c.ok} bien · {c.warning} atención · {c.missing} faltan · {c.na} no aplican)</h2>
            <ScrollRegion label="Comprobaciones de configuración"><table>
              <thead><tr><th scope="col">Ajuste</th><th scope="col">Variable</th><th scope="col">Estado</th><th scope="col">Detalle</th></tr></thead>
              <tbody>{s.checks.map((k) => (
                <tr key={k.key}>
                  <td>{k.label}</td><td><code>{k.key}</code></td>
                  <td><span style={pill(k.status)}>{CHECK_TEXT[k.status]}</span></td><td>{k.hint}</td>
                </tr>
              ))}</tbody>
            </table></ScrollRegion>

            <h2>Respaldos y restauración</h2>
            <p style={{ color: "#555", maxWidth: "70ch" }}>
              Estas fechas las <strong>declara operaciones</strong> en el entorno; la plataforma no las mide. Si no se actualizan, se marcan como vencidas.
            </p>
            <ScrollRegion label="Respaldos y simulacros"><table>
              <thead><tr><th scope="col">Qué</th><th scope="col">Declarado</th><th scope="col">Estado</th><th scope="col">Detalle</th></tr></thead>
              <tbody>{s.attestations.map((a) => (
                <tr key={a.key}>
                  <td>{a.label}<br /><small><code>{a.key}</code></small></td><td>{formatDate(a.declared_at)}</td>
                  <td><span style={pill(a.status === "ok" ? "ok" : a.status === "stale" ? "missing" : "warning")}>{ATTESTATION_TEXT[a.status]}</span></td>
                  <td>{attestationText(a)}<br /><small>{a.source}</small></td>
                </tr>
              ))}</tbody>
            </table></ScrollRegion>

            <h2>Guías operativas</h2>
            <ScrollRegion label="Guías operativas"><table>
              <thead><tr><th scope="col">Guía</th><th scope="col">Ubicación en el repositorio</th><th scope="col">Cuándo usarla</th></tr></thead>
              <tbody>{s.runbooks.map((r) => <tr key={r.path}><td>{r.title}</td><td><code>{r.path}</code></td><td>{r.use_when}</td></tr>)}</tbody>
            </table></ScrollRegion>
          </>
        );
      })()}
    </section>
  );
}
