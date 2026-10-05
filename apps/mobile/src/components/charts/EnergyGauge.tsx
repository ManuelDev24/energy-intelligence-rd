import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { chartColors, colors, spacing } from '../../theme';
import { EmptyState } from '../states';
import { gaugeArcPath, scoreFraction } from './chartMath';

/**
 * CH-09 — Energy Score 0–100 en un semicírculo. Aún NO se usa en pantallas: la API no expone
 * un puntaje (ERD-SCORE-01). Sin `score` muestra un estado vacío; nunca un valor inventado.
 */
export function EnergyGauge({
  score,
  label = 'Energy Score',
  caption = 'Indicador interno y configurable',
  size = 200,
  testID = 'energy-gauge',
}: {
  score: number | null | undefined;
  label?: string;
  caption?: string;
  size?: number;
  testID?: string;
}) {
  const fraction = scoreFraction(score);
  if (fraction === null) {
    return <EmptyState compact icon="speedometer-outline" title="Sin puntaje todavía" hint="Se calculará cuando haya datos suficientes." testID={`${testID}-empty`} />;
  }
  const stroke = 16;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = r + stroke / 2;
  const h = cy + stroke / 2;
  const value = Math.round(fraction * 100);
  // Banda de color por tramos; el número y el texto también comunican el nivel.
  const color = value >= 70 ? chartColors.real : value >= 40 ? colors.warning : colors.danger;
  const level = value >= 70 ? 'bueno' : value >= 40 ? 'mejorable' : 'bajo';

  return (
    <View
      style={s.wrap}
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${label}: ${value} de 100, nivel ${level}. ${caption}`}
    >
      <Svg width={size} height={h}>
        <Path d={gaugeArcPath(cx, cy, r, 1)} stroke={chartColors.grid} strokeWidth={stroke} strokeLinecap="round" fill="none" />
        {fraction > 0 ? (
          <Path d={gaugeArcPath(cx, cy, r, fraction)} stroke={color} strokeWidth={stroke} strokeLinecap="round" fill="none" />
        ) : null}
      </Svg>
      <View style={[s.center, { width: size, top: h * 0.42 }]}>
        <Text style={s.value}>{value}</Text>
        <Text style={s.of}>de 100 · {level}</Text>
      </View>
      <Text style={s.label}>{label}</Text>
      <Text style={s.caption}>{caption}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.xs },
  center: { position: 'absolute', alignItems: 'center' },
  value: { fontSize: 36, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
  of: { fontSize: 12, color: colors.muted },
  label: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: spacing.sm },
  caption: { fontSize: 12, color: colors.muted },
});
