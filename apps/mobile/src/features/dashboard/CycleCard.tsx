import { currentCycle } from '@energyrd/core';
import { StyleSheet, Text, View } from 'react-native';

import { useConsumption } from '../../api/hooks';
import { DataStatusBadge } from '../../components/DataStatusBadge';
import { fmtMetric, fmtPeriod } from '../../lib/format';
import { todayRD } from '../../lib/rdTime';
import { colors, radius, spacing } from '../../theme';
import { cyclePercent, cycleProgressText } from './cycle';

/**
 * ERD-CHARTS-01: ciclo de facturación actual. Las fechas son una ESTIMACIÓN a partir de la última factura; el consumo es
 * lo que ya registran las lecturas del medidor (con su calidad y cobertura). Sin lecturas no se inventa un valor.
 */
export function CycleCard({
  homeId,
  lastBill,
  today = todayRD(),
}: {
  homeId: string;
  lastBill: { period_start: string; period_end: string; days: number };
  today?: string;
}) {
  const cycle = currentCycle(lastBill, today);
  const consumption = useConsumption(homeId, 'day', cycle.range?.from ?? null, cycle.range?.to ?? null);
  const total = consumption.data?.totals.kwh ?? null;
  const percent = cyclePercent(cycle);
  const active = cycle.state !== 'upcoming';

  return (
    <View style={s.card} testID="card-cycle" accessibilityLabel="Ciclo actual">
      <Text style={s.title} accessibilityRole="header">
        Ciclo actual
      </Text>
      <Text style={s.note}>
        {fmtPeriod(cycle.start, cycle.end)} · fechas estimadas a partir de su última factura; su distribuidora puede facturar otro ciclo.
      </Text>
      <View style={s.row}>
        <Text style={s.progress}>{cycleProgressText(cycle)}</Text>
        {active ? <Text style={s.percent}>{percent}%</Text> : null}
      </View>
      {active ? (
        <>
          <View
            style={s.track}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel="Avance del ciclo"
            accessibilityValue={{ min: 0, max: 100, now: percent }}
            testID="cycle-progress"
          >
            <View style={[s.fill, { width: `${percent}%` }]} />
          </View>
          {consumption.isLoading ? <Text style={s.note}>Cargando consumo del ciclo…</Text> : null}
          {consumption.isError ? (
            <Text style={[s.note, { color: colors.danger }]} accessibilityRole="alert">
              No se pudo cargar el consumo del ciclo.
            </Text>
          ) : null}
          {total ? (
            <View style={s.totalRow} testID="cycle-total">
              <Text style={s.total}>{fmtMetric(total.value, total.unit)}</Text>
              <DataStatusBadge quality={total.quality} />
              <Text style={s.note}>según lecturas del medidor, solo en los días cubiertos.</Text>
            </View>
          ) : consumption.isSuccess ? (
            <Text style={s.text} testID="cycle-empty">
              Aún no hay lecturas que cubran este ciclo.
            </Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  title: { fontSize: 14, fontWeight: '700', color: colors.text },
  note: { color: colors.muted, fontSize: 12 },
  text: { color: colors.text, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progress: { color: colors.text, fontSize: 14, flexShrink: 1 },
  percent: { color: colors.muted, fontSize: 14, fontVariant: ['tabular-nums'] },
  track: { height: 8, borderRadius: radius.full, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.full, backgroundColor: colors.primary },
  totalRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  total: { color: colors.text, fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
