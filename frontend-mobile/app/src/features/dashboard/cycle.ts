import { fmtDate, type CurrentCycle } from '@energyrd/core';

/** Porcentaje de avance del ciclo estimado (0 si aún no empieza). */
export function cyclePercent(cycle: Pick<CurrentCycle, 'state' | 'elapsed' | 'days'>): number {
  if (cycle.state === 'upcoming' || cycle.days <= 0) return 0;
  return Math.min(100, Math.round((cycle.elapsed / cycle.days) * 100));
}

/** Texto de avance: nunca afirma más de lo que se sabe. */
export function cycleProgressText(cycle: Pick<CurrentCycle, 'state' | 'elapsed' | 'days' | 'start'>): string {
  if (cycle.state === 'upcoming') return `El ciclo estimado empieza el ${fmtDate(cycle.start)}.`;
  if (cycle.state === 'overdue') return `Los ${cycle.days} días del ciclo estimado ya pasaron: registre la factura.`;
  return `Día ${cycle.elapsed} de ${cycle.days}`;
}
