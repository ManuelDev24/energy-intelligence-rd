// Solo formato de presentación; nunca aritmética de negocio.

const number = new Intl.NumberFormat("es-DO", { maximumFractionDigits: 2 });

export function formatNumber(value: string): string {
  const n = Number(value);
  return Number.isFinite(n) ? number.format(n) : value;
}

export function formatMetric(value: string, unit: string): string {
  return `${formatNumber(value)} ${unit}`;
}

export function formatDop(value: string): string {
  return `RD$ ${formatNumber(value)}`;
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

export function formatPeriod(start: string, end: string): string {
  return `${formatDate(start)} – ${formatDate(end)}`;
}
