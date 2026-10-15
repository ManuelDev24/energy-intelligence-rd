// Tema del móvil derivado de los tokens de marca compartidos con la web (@energyrd/core).
import { tokens } from '@energyrd/core';

const c = tokens.color;

export const colors = {
  bg: c.bg,
  card: c.card,
  text: c.text,
  muted: c.muted,
  border: c.border,
  primary: c.brand[600],
  primaryText: '#FFFFFF',
  brandDark: c.brand[900],
  brandSoft: c.brand[50],
  accent: c.accent,
  // Texto sobre la cabecera de marca (brand 900): blanco y blanco atenuado (ambos ≥ 9:1).
  onBrand: '#FFFFFF',
  onBrandMuted: 'rgba(255,255,255,0.78)',
  info: c.info, // azul técnico: solo gráficos/información, no texto sobre fondos tintados
  danger: c.danger,
  dangerBg: c.dangerBg,
  dangerBorder: c.dangerBorder,
  warning: c.warning,
  warningBg: c.warningBg,
  warningBorder: c.warningBorder,
  notice: c.notice,
  noticeBg: c.noticeBg,
  noticeBorder: c.noticeBorder,
  success: c.success,
  successBg: c.successBg,
  successBorder: c.successBorder,
  real: c.quality.real,
  realBg: c.quality.realBg,
  estimated: c.quality.estimated,
  estimatedBg: c.quality.estimatedBg,
  projected: c.quality.projected,
  projectedBg: c.quality.projectedBg,
  inferred: c.quality.inferred,
  inferredBg: c.quality.inferredBg,
  // Superficie de los esqueletos de carga (mismo gris que los bordes).
  skeleton: c.border,
};

/** Series de gráficos: real verde, info azul, proyectado morado, estimado azul oscuro. */
export const chartColors = c.chart;

export const spacing = tokens.space;
export const radius = tokens.radius;
export const font = tokens.font;
export const TOUCH = tokens.touchTarget;
