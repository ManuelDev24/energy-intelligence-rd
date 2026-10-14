/** ERD-ADM-DASH-WEB: tipos y formato puros del resumen administrativo. Solo agregados: ninguna persona ni vivienda concreta. */
export type TrendPoint = { day: string; value: number };
export type Overview = {
  generated_at: string; window_days: number;
  users: { total: number; verified: number; new_recent: number; active_sessions: number };
  homes: { total: number }; bills: { total: number; recent: number }; alerts: { unread: number }; outages: { recent: number };
  jobs: { queued: number; running: number; dead: number; oldest_wait_minutes: number; last_finished_at: string | null;
    worker_state: "ok" | "stalled"; ocr_queued: number; ocr_running: number; ocr_dead: number };
  copilot: { provider: "disabled" | "anthropic" | "fake"; messages_today: number; tokens_today: number; people_today: number };
  health: { database: "ok"; storage: string; email: string; error_tracking: "configured" | "not_configured"; environment: string };
  trends: { new_users: TrendPoint[]; new_bills: TrendPoint[]; copilot_messages: TrendPoint[] };
};

export const nf = (value: number) => value.toLocaleString("es-DO");

export type Status = "ok" | "warning" | "off";
export type HealthRow = { label: string; value: string; status: Status; hint?: string };

const PROVIDER: Record<Overview["copilot"]["provider"], string> = { disabled: "Apagado", anthropic: "Claude (Anthropic)", fake: "Simulado (solo desarrollo)" };
const STORAGE: Record<string, string> = { disabled: "No configurado", local: "Disco local (solo desarrollo)", s3: "Almacenamiento S3" };
const EMAIL: Record<string, string> = { console: "Consola (no envía correos)", resend: "Resend" };

/** Estado de los servicios a partir de lo que la API puede afirmar. No inventa: el worker se INFIERE y se dice así. */
export function healthRows(o: Overview): HealthRow[] {
  const prod = o.health.environment === "production" || o.health.environment === "staging";
  return [
    { label: "Base de datos", value: "Responde", status: "ok" },
    { label: "Worker de trabajos", status: o.jobs.worker_state === "ok" ? "ok" : "warning",
      value: o.jobs.worker_state === "ok" ? "Sin atraso" : `Posiblemente detenido: ${o.jobs.oldest_wait_minutes} min de atraso y nada en curso`,
      hint: "Inferido de la cola; el worker no reporta su propio estado." },
    { label: "Almacenamiento de documentos", value: STORAGE[o.health.storage] ?? o.health.storage,
      status: o.health.storage === "disabled" ? "off" : o.health.storage === "local" && prod ? "warning" : "ok" },
    { label: "Correo", value: EMAIL[o.health.email] ?? o.health.email, status: o.health.email === "resend" ? "ok" : prod ? "warning" : "off" },
    { label: "Seguimiento de errores", value: o.health.error_tracking === "configured" ? "Configurado" : "No configurado",
      status: o.health.error_tracking === "configured" ? "ok" : prod ? "warning" : "off" },
    { label: "Copilot", value: PROVIDER[o.copilot.provider], status: o.copilot.provider === "anthropic" ? "ok" : "off" },
  ];
}

export const STATUS_TEXT: Record<Status, string> = { ok: "Bien", warning: "Atención", off: "Desactivado" };

/** Puntos de una serie escalados a un alto fijo (para el SVG); con todo en cero queda plano en la base. */
export function sparkPoints(series: TrendPoint[], width: number, height: number, pad = 2): string {
  if (series.length === 0) return "";
  const max = Math.max(1, ...series.map(p => p.value));
  const step = series.length > 1 ? (width - pad * 2) / (series.length - 1) : 0;
  return series.map((p, i) => `${(pad + i * step).toFixed(1)},${(height - pad - (p.value / max) * (height - pad * 2)).toFixed(1)}`).join(" ");
}
export const seriesTotal = (series: TrendPoint[]) => series.reduce((sum, p) => sum + p.value, 0);
