import { sparkline, sparklineSummary } from '@energyrd/core';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { colors } from '../theme';

export interface TrendInput {
  /** Valores de facturas REALES en orden cronológico (ver `trendValues`). */
  values: readonly number[];
  /** Nombre de la métrica para el lector de pantalla: "consumo", "monto". */
  label: string;
  format: (n: number) => string;
}

const W = 96;
const H = 28;
const PAD = 3;

/** Mini-tendencia de las últimas facturas. Con menos de 3 puntos reales no dibuja nada. */
export function Sparkline({ trend, testID = 'sparkline' }: { trend: TrendInput; testID?: string }) {
  const line = sparkline(trend.values);
  if (!line) return null;
  const pts = line.points.map((p) => ({ x: PAD + p.x * (W - 2 * PAD), y: PAD + p.y * (H - 2 * PAD) }));
  const last = pts[pts.length - 1];
  return (
    <View style={s.box} accessible accessibilityRole="image" accessibilityLabel={sparklineSummary(trend.label, line, trend.format)} testID={testID}>
      <Svg width={W} height={H} importantForAccessibility="no-hide-descendants">
        <Polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={colors.primary} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <Circle cx={last.x} cy={last.y} r={3} fill={colors.primary} />
      </Svg>
    </View>
  );
}

const s = StyleSheet.create({ box: { alignSelf: 'flex-start' } });
