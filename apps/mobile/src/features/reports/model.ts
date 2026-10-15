// ERD-RPT-01-MOBILE: períodos del informe (lógica pura, probada sin React Native).
import { addDays } from '@energyrd/core';

export const REPORT_PERIODS = [
  { key: '6m', label: '6 meses', days: 182 },
  { key: '12m', label: '12 meses', days: 364 },
  { key: 'year', label: 'Este año', days: 0 },
] as const;
export type ReportPeriodKey = (typeof REPORT_PERIODS)[number]['key'];

/** Rango [desde, hasta] para una opción, terminando hoy (hora de RD). «Este año» empieza el 1 de enero. */
export function reportRange(key: ReportPeriodKey, today: string): { from: string; to: string } {
  if (key === 'year') return { from: `${today.slice(0, 4)}-01-01`, to: today };
  const days = REPORT_PERIODS.find((p) => p.key === key)?.days ?? 364;
  return { from: addDays(today, -days), to: today };
}

/** URL absoluta del PDF a partir de la ruta que devuelve la API. Solo `/api/v1/reports/download?token=…` del mismo servidor; nada más se abre. */
export function pdfOpenUrl(apiBase: string, path: string): string | null {
  if (!/^\/api\/v1\/reports\/download\?token=[A-Za-z0-9._~-]{20,600}$/.test(path)) return null;
  return `${apiBase.replace(/\/+$/, '')}${path}`;
}
