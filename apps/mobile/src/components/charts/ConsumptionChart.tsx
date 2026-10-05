import { fmtKwh, fmtMonth, fmtNumber, type ChartBar } from '@energyrd/core';
import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';

import { chartColors, colors, spacing } from '../../theme';
import { QualityBadge } from '../DataStatusBadge';
import { layoutBars, slotWidth } from './chartMath';

const TOP = 18;
const BOTTOM = 20;
/** Por debajo de este ancho de columna las etiquetas de valor se solapan: se omiten (el resumen accesible y la lista las conservan). */
const MIN_SLOT_FOR_VALUES = 30;

/** Resumen textual del gráfico para lectores de pantalla (y como tabla alternativa). */
export function consumptionSummary(series: readonly ChartBar[]): string {
  return series
    .map((b) => `${b.kind === 'PROJECTED' ? 'próxima factura' : fmtMonth(b.periodEnd)} ${fmtKwh(b.kwh)}${b.kind === 'PROJECTED' ? ' proyectado' : ''}`)
    .join(', ');
}

/**
 * CH-01 — Consumo mensual por factura (kWh). Real en verde; la proyección, contorno morado punteado.
 * Solo dibuja lo que envía la API (`monthlySeries`): sin meses interpolados. Con < 1 barra no se dibuja.
 */
export function ConsumptionChart({
  series,
  height = 168,
  testID = 'monthly-chart',
  showLegend = true,
}: {
  series: ChartBar[];
  height?: number;
  testID?: string;
  showLegend?: boolean;
}) {
  const [width, setWidth] = useState(0);
  if (series.length === 0) return null;
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  const bars = layoutBars(series.map((b) => ({ value: b.kwh })), width, height, { topPad: TOP, bottomPad: BOTTOM });
  const showValues = slotWidth(series.length, width) >= MIN_SLOT_FOR_VALUES;
  const hasProjection = series.some((b) => b.kind === 'PROJECTED');
  const baseline = height - BOTTOM;

  return (
    <View testID={testID}>
      <View
        onLayout={onLayout}
        style={{ height }}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Gráfico de consumo mensual en kWh: ${consumptionSummary(series)}`}
      >
        {width > 0 ? (
          <Svg width={width} height={height}>
            <Line x1={0} x2={width} y1={baseline} y2={baseline} stroke={chartColors.grid} strokeWidth={1} />
            {bars.map((r, i) => {
              const b = series[i];
              const projected = b.kind === 'PROJECTED';
              return (
                <Rect
                  key={b.key}
                  x={r.x}
                  y={r.y}
                  width={r.width}
                  height={r.height}
                  rx={4}
                  fill={projected ? colors.projectedBg : chartColors.real}
                  stroke={projected ? chartColors.projected : undefined}
                  strokeWidth={projected ? 1.5 : 0}
                  strokeDasharray={projected ? '4 3' : undefined}
                />
              );
            })}
            {showValues
              ? bars.map((r, i) => (
                  <SvgText
                    key={`v-${series[i].key}`}
                    x={r.cx}
                    y={r.y - 4}
                    fontSize={11}
                    fontWeight="600"
                    fill={series[i].kind === 'PROJECTED' ? chartColors.projected : colors.text}
                    textAnchor="middle"
                  >
                    {fmtNumber(series[i].kwh, 0)}
                  </SvgText>
                ))
              : null}
            {bars.map((r, i) => (
              <SvgText
                key={`m-${series[i].key}`}
                x={r.cx}
                y={height - 5}
                fontSize={11}
                fill={chartColors.axis}
                textAnchor="middle"
              >
                {series[i].kind === 'PROJECTED' ? 'Próx.' : fmtMonth(series[i].periodEnd, { short: true })}
              </SvgText>
            ))}
          </Svg>
        ) : null}
      </View>
      {showLegend ? (
        <View style={s.legend}>
          <View style={s.legendItem}>
            <View style={[s.swatch, { backgroundColor: chartColors.real }]} />
            <Text style={s.legendText}>Factura (kWh)</Text>
          </View>
          {hasProjection ? (
            <View style={s.legendItem}>
              <View style={[s.swatch, s.swatchProjected]} />
              <Text style={s.legendText}>Próxima factura</Text>
              <QualityBadge quality="PROJECTED" />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  swatchProjected: { backgroundColor: colors.projectedBg, borderColor: chartColors.projected, borderWidth: 1.5, borderStyle: 'dashed' },
  legendText: { color: colors.muted, fontSize: 12 },
});
