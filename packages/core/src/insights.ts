// Derivaciones de presentación compartidas (sin aritmética de negocio: los valores vienen de la API).

export interface BillLike {
  id: string;
  period_start: string;
  period_end: string;
  days: number;
  kwh: string;
  amount_dop: string;
}

export interface ChartBar {
  key: string;
  /** Fecha de fin del período (la factura "pertenece" al mes en que cierra). */
  periodEnd: string;
  kwh: number;
  amountDop: number | null;
  kind: 'REAL' | 'PROJECTED';
}

/**
 * Serie para el gráfico mensual: últimas `max` facturas (orden cronológico) y, si existe,
 * la proyección como última barra marcada PROJECTED. No interpola meses faltantes.
 */
export function monthlySeries(
  bills: readonly BillLike[],
  projection?: { kwh: string; amount_dop?: string | null; period_end?: string | null } | null,
  max = 6,
): ChartBar[] {
  const real = [...bills]
    .sort((a, b) => a.period_end.localeCompare(b.period_end))
    .slice(-max)
    .map<ChartBar>((b) => ({
      key: b.id,
      periodEnd: b.period_end,
      kwh: Number(b.kwh),
      amountDop: Number(b.amount_dop),
      kind: 'REAL',
    }));
  if (projection && real.length > 0) {
    const last = real[real.length - 1].periodEnd;
    real.push({
      key: 'projection',
      periodEnd: projection.period_end ?? addDays(last, 30),
      kwh: Number(projection.kwh),
      amountDop: projection.amount_dop != null ? Number(projection.amount_dop) : null,
      kind: 'PROJECTED',
    });
  }
  return real;
}

const pad = (n: number) => String(n).padStart(2, '0');
const toIso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const fromIso = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);

export function addDays(iso: string, days: number): string {
  const d = fromIso(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

/** Días facturados inclusivos: 1–31 ago = 31. */
export const daysBetween = (start: string, end: string) =>
  Math.round((fromIso(end).getTime() - fromIso(start).getTime()) / 86_400_000) + 1;

/**
 * Período sugerido para la próxima factura: empieza el día siguiente al fin de la última y
 * dura lo mismo que ella (las distribuidoras facturan ciclos ~30 días). Sin facturas: mes calendario anterior.
 */
export function suggestNextPeriod(
  lastBill: Pick<BillLike, 'period_end' | 'days'> & Partial<Pick<BillLike, 'period_start'>> | null | undefined,
  today: Date = new Date(),
): { period_start: string; period_end: string; days: number } {
  if (lastBill) {
    const start = addDays(lastBill.period_end, 1);
    // Si la última factura cubrió un mes calendario completo, sugerir el mes siguiente completo
    // (1–30 sep, no 1 sep–1 oct); si no, repetir la duración del ciclo anterior.
    const prevStart = lastBill.period_start ?? null;
    const endsMonth = addDays(lastBill.period_end, 1).slice(8, 10) === '01';
    if (prevStart && prevStart.slice(8, 10) === '01' && endsMonth) {
      const d = fromIso(start);
      const end = toIso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
      return { period_start: start, period_end: end, days: daysBetween(start, end) };
    }
    const days = lastBill.days > 0 ? lastBill.days : 30;
    return { period_start: start, period_end: addDays(start, days - 1), days };
  }
  const firstThisMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const end = new Date(firstThisMonth.getTime() - 86_400_000);
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  return { period_start: toIso(start), period_end: toIso(end), days: end.getUTCDate() };
}
