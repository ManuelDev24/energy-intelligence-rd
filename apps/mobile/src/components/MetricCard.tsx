import type { Quality } from '@energyrd/core';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '../theme';
import { deltaDisplay } from './charts/chartMath';
import { QualityBadge } from './DataStatusBadge';

export interface MetricDelta {
  /** Variación numérica tal como la envía la API (p. ej. `kwh_pct.value`). */
  value: number | string;
  /** Texto ya formateado de la variación, p. ej. "+12.50%". */
  text: string;
  /** Contexto: "vs. jun 2026". */
  context?: string;
  /** Sentido favorable para el usuario; en consumo y monto, bajar es bueno. */
  goodWhen?: 'down' | 'up';
  quality?: Quality;
}

/**
 * Tarjeta de métrica (CH-03): etiqueta, valor grande con cifras tabulares, unidad, variación ▲/▼
 * con color + texto, etiqueta de calidad y una ayuda en lenguaje simple.
 */
export function MetricCard({
  label,
  value,
  unit,
  quality,
  delta,
  helper,
  testID,
}: {
  label: string;
  /** Valor formateado sin la unidad (p. ej. "412" o "RD$ 5,200.00"). */
  value: string;
  unit?: string;
  quality?: Quality;
  delta?: MetricDelta | null;
  helper?: string;
  testID?: string;
}) {
  const d = delta ? deltaDisplay(delta.value, delta.goodWhen) : null;
  const deltaColor = d?.tone === 'bad' ? colors.warning : d?.tone === 'good' ? colors.success : colors.muted;
  const deltaWord = d?.direction === 'up' ? 'subió' : d?.direction === 'down' ? 'bajó' : 'sin cambio';
  const a11y = [
    `${label}: ${value}${unit ? ` ${unit}` : ''}`,
    delta && d ? `${deltaWord} ${delta.text}${delta.context ? ` ${delta.context}` : ''}` : null,
    helper ?? null,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <View style={s.card} testID={testID}>
      {/* Grupo accesible solo para el texto; las etiquetas de calidad quedan como elementos propios. */}
      <View accessible accessibilityLabel={a11y} style={{ gap: 2 }}>
        <Text style={s.label} numberOfLines={2}>
          {label}
        </Text>
        <View style={s.valueRow}>
          <Text style={s.value} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {value}
          </Text>
          {unit ? <Text style={s.unit}>{unit}</Text> : null}
        </View>
        {delta && d ? (
          <Text style={[s.delta, { color: deltaColor }]}>
            {d.arrow} {delta.text}
            {delta.context ? <Text style={s.deltaContext}> {delta.context}</Text> : null}
          </Text>
        ) : null}
        {helper ? <Text style={s.helper}>{helper}</Text> : null}
      </View>
      {(quality && quality !== 'REAL') || (delta?.quality && delta.quality !== 'REAL') ? (
        <View style={s.badges}>
          {quality ? <QualityBadge quality={quality} /> : null}
          {delta?.quality && delta.quality !== quality ? <QualityBadge quality={delta.quality} /> : null}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    flexGrow: 1,
    flexBasis: '45%',
    minWidth: 140,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  label: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  value: { color: colors.text, fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'], flexShrink: 1 },
  unit: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  delta: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  deltaContext: { color: colors.muted, fontWeight: '400' },
  helper: { color: colors.muted, fontSize: 12 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
});
