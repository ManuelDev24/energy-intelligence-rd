import { scoreCoverageNote } from '@energyrd/core';
import { StyleSheet, Text, View } from 'react-native';

import { useEnergyScore } from '../../api/hooks';
import { QualityBadge } from '../../components/DataStatusBadge';
import { EnergyGauge } from '../../components/charts/EnergyGauge';
import { EmptyState } from '../../components/states';
import { colors, radius, spacing } from '../../theme';
import { scoreRows } from './scoreRows';

/** ERD-SCORE-01: Energy Score del backend con sus cuatro componentes. Sin puntaje explica qué falta; nunca inventa uno. */
export function EnergyScoreCard({ homeId }: { homeId: string }) {
  const { data, isLoading, isError } = useEnergyScore(homeId);
  if (isLoading || isError || !data) return null;    // es un extra del panel: si falla, el panel sigue completo
  return (
    <View style={s.card} testID="energy-score">
      <View style={s.head}>
        <Text style={s.title} accessibilityRole="header">Energy Score</Text>
        {data.score !== null ? <QualityBadge quality="INFERRED" always /> : null}
      </View>
      {data.score === null ? (
        <EmptyState compact icon="speedometer-outline" title="Sin puntaje todavía" hint={data.reasons[0] ?? 'Se calculará cuando haya datos suficientes.'} testID="energy-score-empty" />
      ) : (
        <>
          <EnergyGauge score={data.score} caption={scoreCoverageNote(data) ?? 'Indicador interno INFERIDO, orientativo.'} />
          {scoreRows(data).map((r) => (
            <View key={r.key} style={s.row} testID={`score-${r.key}`} accessible accessibilityLabel={r.accessibilityLabel}>
              <View style={s.rowHead}>
                <Text style={s.rowLabel}>{r.label}</Text>
                <Text style={s.rowValue}>{r.value}</Text>
              </View>
              {r.fraction !== null ? <View style={s.track}><View style={[s.fill, { width: `${Math.round(r.fraction * 100)}%` }]} /></View> : null}
              <Text style={s.rowText}>{r.text}</Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  row: { gap: spacing.xs },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between' },
  rowLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  rowValue: { fontSize: 14, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  rowText: { fontSize: 12, color: colors.muted },
});
