/** ERD-ADM-OPS-WEB: tipos y reglas puras de la vista de trabajos en segundo plano. Solo lectura; sin cargas útiles ni textos de error. */
export type JobKindRow = {
  kind: string; queued: number; running: number; dead: number; succeeded_24h: number; dead_24h: number; cancelled_24h: number;
  overdue: number; oldest_wait_minutes: number; last_finished_at: string | null; last_success_at: string | null;
};
export type JobsSummary = { generated_at: string; overdue_minutes: number; kinds: JobKindRow[] };
export type JobStatus = "queued" | "running" | "succeeded" | "dead" | "cancelled";
export type AdminJob = {
  id: number; kind: string; status: JobStatus; attempts: number; max_attempts: number; run_at: string; created_at: string;
  started_at: string | null; finished_at: string | null; has_error: boolean; overdue: boolean;
};
export type AdminJobsPage = { items: AdminJob[]; total: number; limit: number; offset: number };

export const JOBS_PAGE_SIZE = 25;
export const STATUS_OPTIONS: Array<{ value: "" | JobStatus; label: string }> = [
  { value: "", label: "Todos" }, { value: "queued", label: "En cola" }, { value: "running", label: "En curso" },
  { value: "succeeded", label: "Terminados" }, { value: "dead", label: "Muertos (sin reintentos)" }, { value: "cancelled", label: "Cancelados" },
];
export const statusLabel = (status: string) => STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;

const KIND = /^[a-z][a-z0-9_.-]{0,63}$/;
export function buildJobsQuery(kind: string, status: "" | JobStatus, offset: number): string {
  const qs = new URLSearchParams();
  if (KIND.test(kind)) qs.set("kind", kind);
  if (status) qs.set("status", status);
  qs.set("limit", String(JOBS_PAGE_SIZE));
  qs.set("offset", String(Math.max(0, offset)));
  return `?${qs.toString()}`;
}

export type Attention = "ok" | "warning" | "critical";
/** Gravedad de un tipo de trabajo: muertos recientes o espera larga = atención; sin ninguno de los dos = bien. */
export function kindAttention(k: JobKindRow): { level: Attention; reasons: string[] } {
  const reasons: string[] = [];
  if (k.dead_24h > 0) reasons.push(`${k.dead_24h} muerto${k.dead_24h === 1 ? "" : "s"} en 24 h`);
  if (k.overdue > 0) reasons.push(`${k.overdue} en cola con retraso (el más antiguo espera ${k.oldest_wait_minutes} min)`);
  const level: Attention = k.overdue > 0 && k.running === 0 ? "critical" : reasons.length ? "warning" : "ok";
  return { level, reasons };
}
export const ATTENTION_TEXT: Record<Attention, string> = { ok: "Bien", warning: "Atención", critical: "Posiblemente detenido" };

export function worstAttention(kinds: JobKindRow[]): Attention {
  const levels = kinds.map((k) => kindAttention(k).level);
  return levels.includes("critical") ? "critical" : levels.includes("warning") ? "warning" : "ok";
}
