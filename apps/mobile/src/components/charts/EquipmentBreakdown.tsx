import { fmtMetric } from '@energyrd/core';
import { StyleSheet, Text, View } from 'react-native';

import type { EquipmentEstimate } from '../../api/types';
import { chartColors, colors, radius, spacing } from '../../theme';
import { QualityBadge } from '../DataStatusBadge';
import { EmptyState } from '../states';
import { equipmentShares } from './chartMath';

/**
 * CH-10 — Desglose del consumo estimado por equipo (kWh/mes y % del total de equipos).
 * Los kWh vienen del estimado de la API; el % solo reparte ese total para comparar equipos.
 * Todo es ESTIMADO (potencia × horas declaradas), nunca una medición.
 */
export function EquipmentBreakdown({ estimate, maxItems = 6 }: { estimate: EquipmentEstimate; maxItems?: number }) {
  const unit = estimate.items[0]?.monthly_kwh.unit ?? 'kWh';
  const rows = equipmentShares(
    estimate.items.map((i) => ({ key: i.equipment_id, label: i.name, value: Number(i.monthly_kwh.value) })),
    maxItems,
  );
  const summary = rows.map((r) => `${r.label} ${fmtMetric(r.value, unit)} al mes, ${r.pct}%`).join('; ');

  return (
    <View style={s.card} testID="equipment-breakdown">
      <View style={s.header}>
        <Text style={s.title} accessibilityRole="header">
          ¿Qué equipo consume más?
        </Text>
        <QualityBadge quality="ESTIMATED" />
      </View>
      {rows.length === 0 ? (
        <EmptyState
          compact
          icon="flash-off-outline"
          title="Sin consumo estimado"
          hint="Los equipos declarados suman 0 kWh. Revise la potencia y las horas de uso."
          testID="equipment-breakdown-empty"
        />
      ) : (
        <View accessible accessibilityRole="image" accessibilityLabel={`Desglose estimado por equipo: ${summary}`} style={s.rows}>
          {rows.map((r) => (
            <View key={r.key} style={s.row}>
              <View style={s.rowHead}>
                <Text style={s.name} numberOfLines={1}>
                  {r.label}
                </Text>
                <Text style={s.value}>
                  {fmtMetric(r.value, unit)} · {r.pct}%
                </Text>
              </View>
              <View style={s.track}>
                <View style={[s.bar, { width: `${Math.max(2, r.ratio * 100)}%` }]} />
              </View>
            </View>
          ))}
        </View>
      )}
      <Text style={s.note}>Porcentaje del total estimado de los equipos declarados, al mes ({estimate.days_per_month} días).</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { fontWeight: '700', color: colors.text, fontSize: 15, flexShrink: 1 },
  rows: { gap: spacing.md },
  row: { gap: 4 },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  name: { color: colors.text, fontSize: 14, flexShrink: 1 },
  value: { color: colors.text, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  track: { height: 10, borderRadius: radius.full, backgroundColor: colors.estimatedBg, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: radius.full, backgroundColor: chartColors.estimated },
  note: { color: colors.muted, fontSize: 12 },
});
