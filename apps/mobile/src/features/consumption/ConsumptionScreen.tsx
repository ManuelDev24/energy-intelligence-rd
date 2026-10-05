import type { ConsumptionBucketItem, Granularity } from '@energyrd/api-contracts';
import { fmtMetric, fmtPeriod } from '@energyrd/core';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useConsumption } from '../../api/hooks';
import { ConsumptionBars } from '../../components/charts/ConsumptionBars';
import { DataStatusBadge } from '../../components/DataStatusBadge';
import { Segmented } from '../../components/Segmented';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../components/states';
import { Button } from '../../components/ui';
import { todayRD } from '../../lib/rdTime';
import { useSession } from '../../store/session';
import { colors, radius, spacing, TOUCH } from '../../theme';
import { isEndpointUnavailable } from '../goals/model';
import { bucketLongLabel, bucketValueText, consumptionNotices, reasonText } from './model';
import { GRANULARITIES, PRESETS, rangeForPreset, type PresetKey } from './range';

function Card({ title, children, testID }: { title: string; children: ReactNode; testID?: string }) {
  return (
    <View style={s.card} testID={testID}>
      <Text style={s.cardTitle} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

/** Fila de un agregado: etiqueta, valor y SIEMPRE su calidad (REAL o ESTIMADO), como hermanos. */
function AggregateRow({ label, value, quality, testID }: { label: string; value: string; quality: 'REAL' | 'ESTIMATED' | 'PROJECTED'; testID: string }) {
  return (
    <View style={s.row} testID={testID}>
      <Text style={s.label}>{label}</Text>
      <View style={[s.row, { gap: 6, flexShrink: 1 }]}>
        <Text style={s.value} accessibilityLabel={`${label}: ${value}`}>
          {value}
        </Text>
        <DataStatusBadge quality={quality} testID={`${testID}-quality`} />
      </View>
    </View>
  );
}

function BucketRow({ b, granularity }: { b: ConsumptionBucketItem; granularity: Granularity }) {
  const reason = reasonText(b);
  const label = bucketLongLabel(b, granularity);
  return (
    <View style={s.bucket} testID={`bucket-${b.start}`}>
      <View style={s.row}>
        <Text style={s.bucketLabel}>{label}</Text>
        <View style={[s.row, { gap: 6 }]}>
          <Text style={[s.value, b.kwh === null && { color: colors.muted, fontWeight: '500' }]}>{bucketValueText(b)}</Text>
          {b.quality ? <DataStatusBadge quality={b.quality} testID={`bucket-${b.start}-quality`} /> : null}
        </View>
      </View>
      {reason ? <Text style={s.note}>{reason}</Text> : null}
    </View>
  );
}

export function ConsumptionScreen({ onAddReading, onOpenReadings }: { onAddReading: () => void; onOpenReadings: () => void }) {
  const homeId = useSession((st) => st.selectedHomeId);
  const [preset, setPreset] = useState<PresetKey>('30d');
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [showDetail, setShowDetail] = useState(false);
  const today = todayRD();
  const range = useMemo(() => rangeForPreset(preset, today), [preset, today]);
  const q = useConsumption(homeId, granularity, range.from, range.to);

  const pickPreset = (key: PresetKey) => {
    setPreset(key);
    setGranularity(PRESETS.find((p) => p.key === key)?.granularity ?? 'day');
  };

  if (!homeId) return <EmptyState icon="home-outline" title="Seleccione una vivienda" hint="Toque el nombre de la vivienda arriba para elegirla." />;

  const controls = (
    <View style={{ gap: spacing.sm }}>
      <Segmented label="Rango" options={PRESETS} value={preset} onChange={pickPreset} testIDPrefix="range" />
      <Segmented label="Agrupar por" options={GRANULARITIES} value={granularity} onChange={setGranularity} testIDPrefix="gran" />
      <Text style={s.rangeText} testID="consumption-range">
        {fmtPeriod(range.from, range.to)} · hora de RD
      </Text>
    </View>
  );
  const actions = (
    <View style={s.actions}>
      <View style={{ flex: 1 }}>
        <Button title="Registrar lectura" onPress={onAddReading} testID="add-reading" />
      </View>
      <View style={{ flex: 1 }}>
        <Button title="Ver lecturas" variant="secondary" onPress={onOpenReadings} testID="open-readings" />
      </View>
    </View>
  );

  const unavailable = q.isError && isEndpointUnavailable(q.error);
  let body: ReactNode;
  if (q.isLoading) body = <LoadingSkeleton label="Cargando el consumo…" count={2} />;
  else if (unavailable)
    body = (
      <EmptyState
        compact
        icon="cloud-offline-outline"
        title="Consumo por lecturas no disponible"
        hint="Este servidor todavía no ofrece lecturas del medidor. El resto de la app sigue funcionando."
        testID="consumption-unavailable"
      />
    );
  else if (q.isError) body = <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  else if (q.data) {
    const c = q.data;
    const n = consumptionNotices(c);
    body = n.noData ? (
      <EmptyState
        compact
        icon="speedometer-outline"
        title="Sin consumo en este rango"
        hint="Registre al menos dos lecturas del medidor que cubran estas fechas. Sin lecturas no se muestra 0: se deja vacío."
        action={<Button title="Registrar lectura" onPress={onAddReading} testID="add-reading-empty" />}
        testID="consumption-empty"
      />
    ) : (
      <>
        <Card title="Resumen del rango" testID="consumption-summary">
          {c.totals.kwh ? (
            <AggregateRow label="Total" value={fmtMetric(c.totals.kwh.value, c.totals.kwh.unit)} quality={c.totals.kwh.quality} testID="consumption-total" />
          ) : null}
          {c.average_daily_kwh ? (
            <AggregateRow
              label="Promedio diario"
              value={fmtMetric(c.average_daily_kwh.value, c.average_daily_kwh.unit)}
              quality={c.average_daily_kwh.quality}
              testID="consumption-average"
            />
          ) : null}
          {c.peak_bucket?.kwh && c.peak_bucket.quality ? (
            <AggregateRow
              label={`Pico · ${bucketLongLabel(c.peak_bucket, c.granularity)}`}
              value={fmtMetric(c.peak_bucket.kwh, 'kWh')}
              quality={c.peak_bucket.quality}
              testID="consumption-peak"
            />
          ) : null}
          <Text style={s.note} testID="consumption-coverage">
            Cobertura del rango: {n.coverage}% · {c.readings_used} {c.readings_used === 1 ? 'lectura usada' : 'lecturas usadas'}
          </Text>
          {n.partial > 0 && c.peak_bucket?.reason_code === 'partial_coverage' ? (
            <Text style={s.note}>El pico tiene cobertura parcial: puede estar subestimado.</Text>
          ) : null}
        </Card>

        <Card title={`Consumo por ${GRANULARITIES.find((g) => g.key === c.granularity)?.label.toLowerCase() ?? 'período'} (kWh)`} testID="consumption-chart-card">
          {q.isPlaceholderData ? <Text style={s.note}>Actualizando…</Text> : null}
          <ConsumptionBars buckets={c.buckets} granularity={c.granularity} />
          {n.gaps > 0 ? (
            <Text style={s.note} testID="consumption-gaps">
              {n.gaps} {n.gaps === 1 ? 'período sin lecturas se muestra' : 'períodos sin lecturas se muestran'} vacío: no se registra 0.
            </Text>
          ) : null}
          {n.partial > 0 ? (
            <Text style={s.note}>
              {n.partial} {n.partial === 1 ? 'período tiene' : 'períodos tienen'} cobertura parcial: valor ESTIMADO repartido entre lecturas.
            </Text>
          ) : null}
          <Pressable
            onPress={() => setShowDetail((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showDetail }}
            style={s.toggle}
            testID="consumption-detail-toggle"
          >
            <Text style={s.link}>{showDetail ? 'Ocultar detalle por período' : `Ver detalle por período (${c.buckets.length})`}</Text>
          </Pressable>
          {showDetail ? c.buckets.map((b) => <BucketRow key={b.start} b={b} granularity={c.granularity} />) : null}
        </Card>
      </>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
      refreshControl={<RefreshControl refreshing={q.isRefetching && !q.isPlaceholderData} onRefresh={() => void q.refetch()} />}
      testID="consumption-screen"
    >
      {controls}
      {body}
      {unavailable ? null : actions}
      <Text style={s.note}>
        Resolución: intervalos entre lecturas del medidor (sin datos horarios). REAL = diferencia entre lecturas; ESTIMADO = energía
        repartida por tiempo entre períodos.
      </Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  label: { color: colors.muted, fontSize: 14, flexShrink: 1 },
  value: { color: colors.text, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  note: { color: colors.muted, fontSize: 12 },
  rangeText: { color: colors.muted, fontSize: 13, fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', gap: spacing.sm },
  toggle: { minHeight: TOUCH, justifyContent: 'center' },
  link: { color: colors.primary, fontWeight: '600', fontSize: 14 },
  bucket: { borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: spacing.sm, gap: 2 },
  bucketLabel: { color: colors.text, fontSize: 14, flexShrink: 1 },
});
