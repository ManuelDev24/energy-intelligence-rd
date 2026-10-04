// Solo formato de presentación; nunca aritmética de negocio.
//
// Los decimales llegan de la API como texto (p. ej. "5600.00"). Se muestran con los
// mismos dígitos que envía el backend (mínimo 2): solo se añade el separador de miles,
// de modo que la web y la API enseñan exactamente el mismo valor.

const formatters = new Map<number, Intl.NumberFormat>();

function formatterFor(decimals: number): Intl.NumberFormat {
  let f = formatters.get(decimals);
  if (!f) {
    f = new Intl.NumberFormat("es-DO", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    formatters.set(decimals, f);
  }
  return f;
}

export function formatNumber(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  const decimals = Math.max(2, (value.split(".")[1] ?? "").length);
  return formatterFor(decimals).format(n);
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
