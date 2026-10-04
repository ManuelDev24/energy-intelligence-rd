import type { EnergyBill } from './api';

export function sortBills(bills: readonly EnergyBill[]) {
  return [...bills].sort((a, b) => a.period_end.localeCompare(b.period_end) || a.period_start.localeCompare(b.period_start));
}
/** A preceding calendar month is required; do not replace missing months with older bills. */
export function compareBill(selected: EnergyBill, bills: readonly EnergyBill[]) {
  const date = new Date(`${selected.period_end}T00:00:00Z`);
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - 1);
  const month = date.toISOString().slice(0, 7);
  const candidates = bills.filter(bill => bill.home_id === selected.home_id && bill.period_end.slice(0, 7) === month);
  if (candidates.length !== 1) return null;
  const previous = candidates[0];
  const delta = selected.kwh - previous.kwh;
  return { previous, delta, percent: previous.kwh === 0 ? null : delta / previous.kwh * 100 };
}
