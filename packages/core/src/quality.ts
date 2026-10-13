// Calidad del dato: misma etiqueta, color y explicación en web y móvil.
import { tokens } from './tokens';

export type Quality = 'REAL' | 'ESTIMATED' | 'PROJECTED' | 'INFERRED';
/** Severidades que hoy emite la API de alertas. */
export type Severity = 'warning' | 'critical';
/** Tono visual de una alerta o aviso: las de la API + información y ahorro del plan. */
export type AlertTone = Severity | 'info' | 'savings';

export const QUALITY: Record<Quality, { label: string; fg: string; bg: string; description: string }> = {
  REAL: {
    label: 'REAL',
    fg: tokens.color.quality.real,
    bg: tokens.color.quality.realBg,
    description: 'Tomado tal cual de una factura registrada.',
  },
  ESTIMATED: {
    label: 'ESTIMADO',
    fg: tokens.color.quality.estimated,
    bg: tokens.color.quality.estimatedBg,
    description: 'Calculado a partir de totales (promedios o equipos declarados). No es una medición.',
  },
  PROJECTED: {
    label: 'PROYECTADO',
    fg: tokens.color.quality.projected,
    bg: tokens.color.quality.projectedBg,
    description: 'Tendencia lineal de la próxima factura. No incluye cambios de tarifa.',
  },
  INFERRED: {
    label: 'INFERIDO',
    fg: tokens.color.quality.inferred,
    bg: tokens.color.quality.inferredBg,
    description: 'Deducido por un modelo a partir de otros datos. Orientativo, no medido.',
  },
};

/**
 * Lo REAL es el caso normal: solo se etiqueta lo que NO es real, para que la etiqueta
 * llame la atención donde importa (ver auditoría M3).
 */
export const shouldLabel = (q: Quality) => q !== 'REAL';

export const SEVERITY: Record<AlertTone, { label: string; short: string; fg: string; bg: string; border: string }> = {
  critical: {
    label: 'Alerta crítica',
    short: 'Crítica',
    fg: tokens.color.danger,
    bg: tokens.color.dangerBg,
    border: tokens.color.dangerBorder,
  },
  warning: {
    label: 'Advertencia',
    short: 'Advertencia',
    fg: tokens.color.warning,
    bg: tokens.color.warningBg,
    border: tokens.color.warningBorder,
  },
  info: {
    label: 'Información',
    short: 'Información',
    fg: tokens.color.notice,
    bg: tokens.color.noticeBg,
    border: tokens.color.noticeBorder,
  },
  savings: {
    label: 'Oportunidad de ahorro',
    short: 'Ahorro',
    fg: tokens.color.success,
    bg: tokens.color.successBg,
    border: tokens.color.successBorder,
  },
};

const SOURCE: Record<string, string> = { seed: 'demo', manual: 'manual', mixed: 'mixto', none: 'sin datos' };
const RESOLUTION: Record<string, string> = { monthly: 'mensual', hourly: 'horaria', daily: 'diaria' };

export const sourceLabel = (s: string) => SOURCE[s] ?? s;
export const resolutionLabel = (r: string) => RESOLUTION[r] ?? r;
