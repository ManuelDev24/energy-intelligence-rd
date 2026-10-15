/** ERD-AI-ADMIN-WEB: tipos y reglas puras de la supervisión del Copilot. Solo agregados; nunca contenido de conversaciones. */
export type AiUsage = {
  days: number; assistant_messages: number; by_status: Record<string, number>; input_tokens: number; output_tokens: number;
  latency_p50_ms: number | null; latency_p95_ms: number | null; feedback_up: number; feedback_down: number; conversations: number;
  by_model: Array<{ model: string; messages: number; input_tokens: number; output_tokens: number }>;
  tools: Array<{ name: string; count: number }>;
  by_day: Array<{ day: string; messages: number; tokens: number; people: number }>;
  top_people: Array<{ subject: string; messages: number; tokens: number; days_active: number }>;
  cost: { configured: boolean; input_usd: string | null; output_usd: string | null; total_usd: string | null };
  limits: { provider: "disabled" | "anthropic" | "fake"; model: string; daily_messages_per_user: number; daily_tokens_per_user: number; max_conversations_per_user: number };
};

export const WINDOWS = [7, 14, 30, 90] as const;
export const PROVIDER_TEXT: Record<AiUsage["limits"]["provider"], string> = { disabled: "Apagado", anthropic: "Claude (Anthropic)", fake: "Simulado (solo desarrollo)" };
const STATUS_TEXT: Record<string, string> = { complete: "Completas", cancelled: "Canceladas", error: "Con error", refused: "Rechazadas", limited: "Limitadas por cuota" };
export const statusText = (status: string) => STATUS_TEXT[status] ?? status;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Seudónimo corto para la tabla; el enlace a la persona solo existe si es un UUID real (no «pilot»). */
export const shortSubject = (subject: string) => (UUID.test(subject) ? `${subject.slice(0, 8)}…` : subject);
export const isPersonId = (subject: string) => UUID.test(subject);

/** Porcentaje entero; sin mensajes no se inventa 0 %. */
export function percent(part: number, total: number): string {
  return total <= 0 ? "—" : `${Math.round((part / total) * 100)} %`;
}
/** Tasa de problemas = con error + rechazadas sobre el total de respuestas. */
export function problemRate(u: AiUsage): string {
  return percent((u.by_status.error ?? 0) + (u.by_status.refused ?? 0), u.assistant_messages);
}
export function satisfaction(u: AiUsage): string {
  return percent(u.feedback_up, u.feedback_up + u.feedback_down);
}

/** Formato propio (punto de millar): no depende de los datos de idioma del sistema. */
export const nfs = (n: number) => String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
export const ms = (value: number | null) => (value === null ? "—" : value >= 1000 ? `${(value / 1000).toFixed(1).replace(".", ",")} s` : `${value} ms`);
export const usd = (value: string | null) => (value === null ? "—" : `US$ ${Number(value).toFixed(2).replace(".", ",")}`);

/** Barra de uso diario respecto al máximo del periodo (0–100). */
export function barWidth(value: number, max: number): number {
  return max <= 0 ? 0 : Math.max(2, Math.round((value / max) * 100));
}
