// Geometría y derivaciones de presentación de los gráficos (CH-01, CH-09, CH-10) y de MetricCard.
// Funciones puras, sin React Native: se prueban con vitest. No calculan métricas de negocio:
// solo convierten los valores que envía la API en alturas, porcentajes de ancho y trazos.

export interface BarInput {
  value: number;
}

export interface BarRect {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Centro horizontal de la columna: ancla de la etiqueta del valor y del mes. */
  cx: number;
}

export interface BarLayoutOptions {
  /** Espacio reservado arriba para la etiqueta del valor. */
  topPad?: number;
  /** Espacio reservado abajo para el eje de meses. */
  bottomPad?: number;
  /** Fracción de la columna que ocupa la barra (0–1). */
  barRatio?: number;
  maxBarWidth?: number;
  /** Altura mínima visible para valores > 0 (un valor pequeño no debe desaparecer). */
  minBarHeight?: number;
}

const finiteNonNegative = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);

/**
 * Barras verticales: cada valor ocupa una columna de igual ancho; la altura es proporcional
 * al máximo de la serie. Valores no finitos o negativos se dibujan con altura 0 (nunca se inventan).
 */
export function layoutBars(
  data: readonly BarInput[],
  width: number,
  height: number,
  { topPad = 18, bottomPad = 20, barRatio = 0.62, maxBarWidth = 40, minBarHeight = 2 }: BarLayoutOptions = {},
): BarRect[] {
  if (data.length === 0 || width <= 0 || height <= 0) return [];
  const plotH = Math.max(0, height - topPad - bottomPad);
  const baseline = topPad + plotH;
  const slot = width / data.length;
  const barW = Math.min(maxBarWidth, slot * barRatio);
  const max = Math.max(0, ...data.map((d) => finiteNonNegative(d.value)));
  return data.map((d, i) => {
    const v = finiteNonNegative(d.value);
    const h = max > 0 && v > 0 ? Math.max(minBarHeight, (v / max) * plotH) : 0;
    const cx = slot * i + slot / 2;
    return { x: cx - barW / 2, y: baseline - h, width: barW, height: h, cx };
  });
}

export interface NullableBarRect extends BarRect {
  /** Sin dato (`null`): se dibuja como hueco de altura completa, nunca como barra de 0. */
  gap: boolean;
}

/**
 * Barras con huecos (consumo por lecturas): `null` = período sin cobertura. El hueco ocupa toda el
 * área del gráfico (marcador punteado) para que se vea y no se confunda con un 0 real, que mide 0.
 * Con muchas columnas (p. ej. 365 días) la barra ocupa toda la columna para seguir visible.
 */
export function layoutNullableBars(
  values: readonly (number | null)[],
  width: number,
  height: number,
  options: BarLayoutOptions = {},
): NullableBarRect[] {
  const { topPad = 18, bottomPad = 20 } = options;
  const slot = slotWidth(values.length, width);
  const barRatio = slot < 4 ? 1 : options.barRatio;
  const rects = layoutBars(values.map((v) => ({ value: v ?? 0 })), width, height, { ...options, topPad, bottomPad, barRatio });
  const plotH = Math.max(0, height - topPad - bottomPad);
  return rects.map((r, i) => (values[i] === null ? { ...r, y: topPad, height: plotH, gap: true } : { ...r, gap: false }));
}

/** Índices de columnas con etiqueta en el eje: salto uniforme para que no se solapen (siempre la primera). */
export function axisLabelIndices(count: number, width: number, minSpacing = 36): number[] {
  if (count <= 0 || width <= 0) return [];
  const fit = Math.max(1, Math.floor(width / minSpacing));
  const step = Math.max(1, Math.ceil(count / fit));
  const out: number[] = [];
  for (let i = 0; i < count; i += step) out.push(i);
  return out;
}

/** Ancho de columna disponible por barra; por debajo de ~28 pt las etiquetas de valor se solapan. */
export const slotWidth = (count: number, width: number) => (count > 0 && width > 0 ? width / count : 0);

export interface ShareInput {
  key: string;
  label: string;
  value: number;
}

export interface Share extends ShareInput {
  /** Porcentaje del total de la serie (0–100), redondeado a 1 decimal. */
  pct: number;
  /** Ancho relativo de la barra respecto a la mayor (0–1). */
  ratio: number;
}

/**
 * Desglose CH-10: ordena de mayor a menor, agrupa lo que exceda `maxItems` en "Otros" y expresa
 * cada parte como % del total de equipos declarados. El total 0 devuelve [] (no hay gráfico vacío).
 */
export function equipmentShares(items: readonly ShareInput[], maxItems = 6, othersLabel = 'Otros'): Share[] {
  const clean = items.map((i) => ({ ...i, value: finiteNonNegative(i.value) })).filter((i) => i.value > 0);
  const total = clean.reduce((acc, i) => acc + i.value, 0);
  if (total <= 0) return [];
  const sorted = [...clean].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  let rows: ShareInput[] = sorted;
  if (sorted.length > maxItems) {
    const head = sorted.slice(0, maxItems - 1);
    const rest = sorted.slice(maxItems - 1);
    rows = [
      ...head,
      { key: 'others', label: `${othersLabel} (${rest.length})`, value: rest.reduce((acc, i) => acc + i.value, 0) },
    ];
  }
  const max = Math.max(...rows.map((r) => r.value));
  return rows.map((r) => ({ ...r, pct: Math.round((r.value / total) * 1000) / 10, ratio: r.value / max }));
}

export type DeltaDirection = 'up' | 'down' | 'flat';
export type DeltaTone = 'good' | 'bad' | 'neutral';

/**
 * Variación ▲/▼ de MetricCard. `goodWhen` dice qué sentido es favorable para el usuario:
 * en consumo y monto, bajar es bueno. El color nunca va solo: flecha + texto.
 */
export function deltaDisplay(
  value: number | string | null | undefined,
  goodWhen: 'down' | 'up' = 'down',
): { direction: DeltaDirection; arrow: string; tone: DeltaTone } | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const direction: DeltaDirection = n > 0 ? 'up' : n < 0 ? 'down' : 'flat';
  const arrow = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '=';
  const tone: DeltaTone = direction === 'flat' ? 'neutral' : direction === goodWhen ? 'good' : 'bad';
  return { direction, arrow, tone };
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const round = (v: number) => Math.round(v * 100) / 100;

/** Punto sobre el semicírculo superior: fracción 0 = extremo izquierdo, 1 = extremo derecho. */
export function gaugePoint(cx: number, cy: number, r: number, fraction: number) {
  const angle = Math.PI * (1 - clamp01(fraction));
  return { x: round(cx + r * Math.cos(angle)), y: round(cy - r * Math.sin(angle)) };
}

/**
 * Trazo SVG del arco del medidor CH-09, de 0 hasta `fraction` del semicírculo.
 * Fracción 0 devuelve '' (no se dibuja nada). Un semicírculo nunca supera 180°: large-arc = 0.
 */
export function gaugeArcPath(cx: number, cy: number, r: number, fraction: number): string {
  const f = clamp01(fraction);
  if (f === 0) return '';
  const start = gaugePoint(cx, cy, r, 0);
  const end = gaugePoint(cx, cy, r, f);
  return `M ${start.x} ${start.y} A ${r} ${r} 0 0 1 ${end.x} ${end.y}`;
}

/** Puntaje 0–100 → fracción; valores fuera de rango se acotan, no finitos → null (sin dato). */
export function scoreFraction(score: number | null | undefined): number | null {
  if (score === null || score === undefined || !Number.isFinite(score)) return null;
  return clamp01(score / 100);
}
