/** ERD-ADM-SYSTEM-WEB: tipos y reglas puras de la vista de configuración y salud. Nunca valores de variables: solo nombres y estado. */
export type CheckStatus = "ok" | "warning" | "missing" | "na";
export type SystemCheck = { key: string; label: string; status: CheckStatus; hint: string };
export type Attestation = { key: string; label: string; declared_at: string | null; age_days: number | null; max_age_days: number; status: "ok" | "stale" | "unknown"; source: string };
export type SystemStatus = {
  environment: string; version: string; release: string | null; started_at: string; uptime_seconds: number;
  migrations: { current: string | null; head: string | null; up_to_date: boolean | null };
  checks: SystemCheck[]; attestations: Attestation[]; runbooks: Array<{ title: string; path: string; use_when: string }>;
};

export const CHECK_TEXT: Record<CheckStatus, string> = { ok: "Bien", warning: "Atención", missing: "Falta", na: "No aplica" };
export const ATTESTATION_TEXT: Record<Attestation["status"], string> = { ok: "Al día", stale: "Vencido", unknown: "Sin dato" };

export type Overall = "ok" | "warning" | "critical";
/** Peor estado entre las comprobaciones y las migraciones: «falta» o migraciones desfasadas = crítico. */
export function overall(s: SystemStatus): Overall {
  if (s.checks.some((c) => c.status === "missing") || s.migrations.up_to_date === false) return "critical";
  if (s.checks.some((c) => c.status === "warning") || s.attestations.some((a) => a.status !== "ok") || s.migrations.up_to_date === null) return "warning";
  return "ok";
}

export function counts(checks: SystemCheck[]): Record<CheckStatus, number> {
  return checks.reduce((acc, c) => ({ ...acc, [c.status]: acc[c.status] + 1 }), { ok: 0, warning: 0, missing: 0, na: 0 } as Record<CheckStatus, number>);
}

export function migrationsText(m: SystemStatus["migrations"]): string {
  if (m.up_to_date === true) return `Al día (revisión ${m.current}).`;
  if (m.up_to_date === false) return `Desfasadas: aplicada ${m.current}, la última del código es ${m.head}. Hay migraciones pendientes.`;
  return "No se pudo verificar (no se leyó la revisión aplicada o la del código).";
}

export function uptimeText(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ${m % 60} min`;
  return `${Math.floor(h / 24)} días ${h % 24} h`;
}

export function attestationText(a: Attestation): string {
  if (a.declared_at === null) return "Sin fecha declarada.";
  const age = a.age_days ?? 0;
  return a.status === "stale" ? `Hace ${age} días: pasó el máximo de ${a.max_age_days}.` : `Hace ${age} días (máximo ${a.max_age_days}).`;
}
