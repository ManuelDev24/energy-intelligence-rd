import type { ConsumptionFilters, MonthlyConsumption } from './types';

export function filterConsumption(records: readonly MonthlyConsumption[], filters: ConsumptionFilters) {
  return records.filter(record => record.homeId === filters.homeId
    && record.month.startsWith(`${filters.year}-`)
    && (filters.status === 'ALL' || record.status === filters.status))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export function previousMonth(month: string): string {
  const [year, number] = month.split('-').map(Number);
  return number === 1 ? `${year - 1}-12` : `${year}-${String(number - 1).padStart(2, '0')}`;
}

export function compareMonth(current: MonthlyConsumption, records: readonly MonthlyConsumption[]) {
  const previous = records.find(record => record.homeId === current.homeId
    && record.month === previousMonth(current.month));
  if (!previous) return null;
  const delta = current.kWh - previous.kWh;
  return { previous, delta, percent: previous.kWh === 0 ? null : delta / previous.kWh * 100 };
}
