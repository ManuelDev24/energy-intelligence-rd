import type { ConsumptionBucketItem, Granularity } from '@energyrd/api-contracts';
import { fmtNumber } from '@energyrd/core';
import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';

import { bucketLabel, bucketValues, chartSummary } from '../../features/consumption/model';
import { chartColors, colors, spacing } from '../../theme';
import { axisLabelIndices, layoutNullableBars, slotWidth } from './chartMath';

const TOP = 18;
const BOTTOM = 20;
const MIN_SLOT_FOR_VALUES = 32;
const GRANULARITY_WORD: Record<Granularity, string> = { day: 'día', week: 'semana', month: 'mes' };

/**
 * CH-02 — Consumo por lecturas del medidor (kWh por día/semana/mes).
 * REAL: verde sólido. ESTIMADO (reparto parcial): azul claro con borde. Sin dato: hueco punteado de
 * altura completa, nunca una barra de 0 (un 0 real mide 0 y se rotula "0"). La forma y la leyenda
 * distinguen los tres casos, no solo el color; el detalle por período queda en la tabla accesible.
 */
export function ConsumptionBars({
  buckets,
  granularity,
  height = 180,
  testID = 'consumption-chart',
}: {
  buckets: readonly ConsumptionBucketItem[];
  granularity: Granularity;
  height?: number;
  testID?: string;
}) {
  const [width, setWidth] = useState(0);
  if (buckets.length === 0) return null;
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  const values = bucketValues(buckets);
  const bars = layoutNullableBars(values, width, height, { topPad: TOP, bottomPad: BOTTOM, maxBarWidth: 36 });
  const slot = slotWidth(buckets.length, width);
  const showValues = slot >= MIN_SLOT_FOR_VALUES;
  const labelled = new Set(axisLabelIndices(buckets.length, width, granularity === 'month' ? 40 : 44));
  const baseline = height - BOTTOM;
  const dense = bars.length > 0 && bars[0].width < 4;
  const hasGap = values.some((v) => v === null);
  const hasEstimated = buckets.some((b) => b.quality === 'ESTIMATED');

  return (
    <View testID={testID}>
      <View
        onLayout={onLayout}
        style={{ height }}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Gráfico de consumo en kWh por ${GRANULARITY_WORD[granularity]}: ${chartSummary(buckets, granularity)}`}
      >
        {width > 0 ? (
          <Svg width={width} height={height}>
            <Line x1={0} x2={width} y1={baseline} y2={baseline} stroke={chartColors.grid} strokeWidth={1} />
            {bars.map((r, i) => {
              const b = buckets[i];
              if (r.gap && dense)
                // Columnas estrechas (p. ej. 365 días): marca bajo el eje en vez de un hueco ilegible.
                return <Rect key={b.start} x={r.x} y={baseline + 2} width={Math.max(1, r.width)} height={3} fill={chartColors.axis} />;
              if (r.gap)
                return (
                  <Rect
                    key={b.start}
                    x={r.x + 0.5}
                    y={r.y + 0.5}
                    width={Math.max(0.5, r.width - 1)}
                    height={Math.max(0, r.height - 1)}
                    rx={r.width >= 8 ? 3 : 0}
                    fill={colors.bg}
                    stroke={chartColors.axis}
                    strokeWidth={1}
                    strokeDasharray="3 3"
                  />
                );
              const estimated = b.quality === 'ESTIMATED';
              return (
                <Rect
                  key={b.start}
                  x={r.x}
                  y={r.y}
                  width={r.width}
                  height={r.height}
                  rx={r.width >= 8 ? 3 : 0}
                  fill={estimated ? colors.estimatedBg : chartColors.real}
                  stroke={estimated ? chartColors.estimated : undefined}
                  strokeWidth={estimated ? 1.5 : 0}
                />
              );
            })}
            {showValues
              ? bars.map((r, i) => (
                  <SvgText
                    key={`v-${buckets[i].start}`}
                    x={r.cx}
                    y={r.gap ? baseline - 6 : r.y - 4}
                    fontSize={11}
                    fontWeight="600"
                    fill={r.gap ? chartColors.axis : colors.text}
                    textAnchor="middle"
                  >
                    {r.gap ? 's/d' : fmtNumber(values[i] as number, 0)}
                  </SvgText>
                ))
              : null}
            {bars.map((r, i) =>
              labelled.has(i) ? (
                <SvgText key={`l-${buckets[i].start}`} x={r.cx} y={height - 5} fontSize={11} fill={chartColors.axis} textAnchor="middle">
                  {bucketLabel(buckets[i], granularity)}
                </SvgText>
              ) : null,
            )}
          </Svg>
        ) : null}
      </View>
      <View style={s.legend} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <View style={s.legendItem}>
          <View style={[s.swatch, { backgroundColor: chartColors.real }]} />
          <Text style={s.legendText}>Real</Text>
        </View>
        {hasEstimated ? (
          <View style={s.legendItem}>
            <View style={[s.swatch, s.swatchEstimated]} />
            <Text style={s.legendText}>Estimado (reparto entre lecturas)</Text>
          </View>
        ) : null}
        {hasGap ? (
          <View style={s.legendItem}>
            <View style={[s.swatch, dense ? s.swatchRug : s.swatchGap]} />
            <Text style={s.legendText}>{dense ? 'Sin dato (marca bajo el eje, no es 0)' : 'Sin dato (no es 0)'}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  swatchEstimated: { backgroundColor: colors.estimatedBg, borderColor: chartColors.estimated, borderWidth: 1.5 },
  swatchGap: { backgroundColor: colors.bg, borderColor: chartColors.axis, borderWidth: 1, borderStyle: 'dashed' },
  swatchRug: { height: 3, backgroundColor: chartColors.axis, borderRadius: 0 },
  legendText: { color: colors.muted, fontSize: 12 },
});
