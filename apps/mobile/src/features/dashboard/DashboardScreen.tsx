import { fmtMonth, fmtPct, monthlySeries, projectionDeltaPct } from '@energyrd/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useBills, useDashboard, useGoalProgress } from '../../api/hooks';
import type { Dashboard, Metric } from '../../api/types';
import { AlertCard } from '../../components/AlertCard';
import { ConsumptionChart } from '../../components/charts/ConsumptionChart';
import { deltaDisplay } from '../../components/charts/chartMath';
import { MetricCard } from '../../components/MetricCard';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../components/states';
import { Button, QualityBadge } from '../../components/ui';
import { fmtMetric, fmtPeriod } from '../../lib/format';
import { GoalCard } from '../goals/GoalCard';
import { metricParts } from '../../lib/metricParts';
import { useSession } from '../../store/session';
import { colors, radius, spacing, TOUCH } from '../../theme';

function Card({ title, children, testID, badge }: { title: string; children: ReactNode; testID?: string; badge?: ReactNode }) {
  return (
    <View style={s.card} testID={testID}>
      <View style={[s.row, { gap: spacing.sm }]}>
        <Text style={s.cardTitle} accessibilityRole="header">
          {title}
        </Text>
        {badge}
      </View>
      {children}
    </View>
  );
}

function Row({ label, metric, signed = false }: { label: string; metric: Metric | null; signed?: boolean }) {
  if (!metric) return null;
  const value = fmtMetric(metric.value, metric.unit, { signed });
  return (
    <View style={s.row} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={s.label}>{label}</Text>
      <View style={[s.row, { gap: 6 }]}>
        <Text style={s.value}>{value}</Text>
        <QualityBadge quality={metric.quality} />
      </View>
    </View>
  );
}

/** Fila de variación (CH-05): flecha ▲/▼ + valor con signo; el color nunca va solo. */
function DeltaRow({ label, delta, pct }: { label: string; delta: Metric; pct: Metric | null }) {
  const d = deltaDisplay(delta.value);
  const color = d?.tone === 'bad' ? colors.warning : d?.tone === 'good' ? colors.success : colors.muted;
  const text = `${fmtMetric(delta.value, delta.unit, { signed: true })}${pct ? ` (${fmtMetric(pct.value, pct.unit, { signed: true })})` : ''}`;
  const word = d?.direction === 'up' ? 'subió' : d?.direction === 'down' ? 'bajó' : 'sin cambio';
  return (
    <View style={s.row} accessible accessibilityLabel={`${label} ${word}: ${text}`}>
      <Text style={s.label}>{label}</Text>
      <View style={[s.row, { gap: 6 }]}>
        <Text style={[s.value, { color }]}>
          {d ? `${d.arrow} ` : ''}
          {text}
        </Text>
        <QualityBadge quality={delta.quality} />
      </View>
    </View>
  );
}

/** Lo primero que ve el usuario: cuánto pagará (o pagó) y una acción para registrar la factura. */
function Hero({ d, onAddBill }: { d: Dashboard; onAddBill?: () => void }) {
  const p = d.projection;
  const last = d.latest_bill;
  if (!last) return null;
  const delta = p ? projectionDeltaPct(p.kwh.value, last.kwh.value) : null;
  const dd = delta !== null ? deltaDisplay(delta) : null;
  return (
    <View style={s.hero} testID="hero">
      <Text style={s.heroLabel}>{p ? 'Próxima factura estimada' : 'Última factura'}</Text>
      <Text style={s.heroValue} adjustsFontSizeToFit numberOfLines={1}>
        {fmtMetric((p ? p.amount_dop : last.amount_dop).value, 'RD$')}
      </Text>
      <View style={[s.row, { justifyContent: 'flex-start', gap: spacing.sm, flexWrap: 'wrap' }]}>
        <Text style={s.heroMeta}>{fmtMetric((p ? p.kwh : last.kwh).value, 'kWh')}</Text>
        {p ? <QualityBadge quality="PROJECTED" /> : null}
        {delta !== null && dd ? (
          <Text style={[s.heroMeta, dd.tone === 'bad' && { color: colors.accent, fontWeight: '700' }]}>
            {dd.arrow} {fmtPct(delta)} vs. la última
          </Text>
        ) : null}
      </View>
      {onAddBill ? (
        <Pressable
          onPress={onAddBill}
          accessibilityRole="button"
          testID="add-bill-hero"
          style={({ pressed }) => [s.heroCta, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="add" size={18} color={colors.brandDark} importantForAccessibility="no" />
          <Text style={s.heroCtaText}>Registrar factura</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function DashboardView({
  d,
  bills,
  onAddBill,
  onOpenAlerts,
  goalSlot,
}: {
  d: Dashboard;
  bills?: Parameters<typeof monthlySeries>[0];
  onAddBill?: () => void;
  onOpenAlerts?: () => void;
  /** Tarjeta de meta mensual (Fase 2); falla en suave si la API no la ofrece. */
  goalSlot?: ReactNode;
}) {
  const { latest_bill: lb, comparison: c, projection: p, alert, recommendation, data_status: ds } = d;
  const [showLegend, setShowLegend] = useState(false);
  const series = bills ? monthlySeries(bills, p ? { kwh: p.kwh.value } : null) : [];
  const vsPrev = c ? `vs. ${fmtMonth(c.previous_period_end)}` : undefined;

  return (
    <>
      {ds.is_demo ? (
        <View style={s.demo} testID="demo-banner">
          <Ionicons name="information-circle-outline" size={16} color={colors.warning} importantForAccessibility="no" />
          <Text style={s.demoText}>Datos de demostración, no son facturas reales.</Text>
        </View>
      ) : null}

      <Hero d={d} onAddBill={onAddBill} />

      {alert ? (
        <AlertCard
          tone={alert.severity}
          message={alert.message}
          onPress={onOpenAlerts}
          accessibilityHint="Abre la lista de alertas"
          testID="alert-banner"
        />
      ) : null}

      {goalSlot}

      {lb ? (
        <Card title={`Última factura · ${fmtPeriod(lb.period_start, lb.period_end)}`} testID="card-latest">
          <View style={s.grid}>
            <MetricCard
              label="Consumo"
              {...metricParts(lb.kwh.value, lb.kwh.unit)}
              quality={lb.kwh.quality}
              delta={c?.kwh_pct ? { value: c.kwh_pct.value, text: fmtPct(c.kwh_pct.value), context: vsPrev, quality: c.kwh_pct.quality } : null}
              helper="kWh: la energía que marcó su contador."
              testID="metric-kwh"
            />
            <MetricCard
              label="Monto"
              {...metricParts(lb.amount_dop.value, lb.amount_dop.unit)}
              quality={lb.amount_dop.quality}
              delta={
                c?.amount_pct
                  ? { value: c.amount_pct.value, text: fmtPct(c.amount_pct.value), context: vsPrev, quality: c.amount_pct.quality }
                  : null
              }
              helper="Lo que cobró la distribuidora, en pesos (RD$)."
              testID="metric-amount"
            />
            {lb.avg_daily_kwh ? (
              <MetricCard
                label="Promedio diario"
                {...metricParts(lb.avg_daily_kwh.value, lb.avg_daily_kwh.unit)}
                quality={lb.avg_daily_kwh.quality}
                helper={`Consumo repartido en ${lb.days} días.`}
                testID="metric-daily"
              />
            ) : null}
            {lb.avg_price_per_kwh ? (
              <MetricCard
                label="Precio medio"
                {...metricParts(lb.avg_price_per_kwh.value, lb.avg_price_per_kwh.unit)}
                quality={lb.avg_price_per_kwh.quality}
                helper="Cuánto pagó en promedio por cada kWh."
                testID="metric-price"
              />
            ) : null}
          </View>
        </Card>
      ) : null}

      {series.length > 1 ? (
        <Card title="Consumo mensual (kWh)" testID="card-chart">
          <ConsumptionChart series={series} />
        </Card>
      ) : null}

      {p ? (
        <Card title="Proyección próxima factura" testID="card-projection" badge={<QualityBadge quality="PROJECTED" />}>
          <Row label="Consumo" metric={p.kwh} />
          <Row label="Monto" metric={p.amount_dop} />
          <Text style={s.note}>
            {p.note} Basada en {p.bills_used} facturas.
          </Text>
        </Card>
      ) : null}

      {c ? (
        <Card title={`Vs. ${fmtPeriod(c.previous_period_start, c.previous_period_end)}`} testID="card-comparison">
          <DeltaRow label="Consumo" delta={c.kwh_delta} pct={c.kwh_pct} />
          <DeltaRow label="Monto" delta={c.amount_delta} pct={c.amount_pct} />
        </Card>
      ) : null}

      {recommendation ? (
        <Card title="Recomendación" testID="card-reco">
          <Text style={{ color: colors.text }}>{recommendation}</Text>
        </Card>
      ) : null}

      {ds.insufficient_reasons.length > 0 ? (
        <Card title="Datos insuficientes" testID="card-insufficient">
          {ds.insufficient_reasons.map((r) => (
            <Text key={r} style={s.note}>
              • {r}
            </Text>
          ))}
        </Card>
      ) : null}

      <Pressable
        onPress={() => setShowLegend((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: showLegend }}
        style={s.legendToggle}
        testID="monthly-note"
      >
        <Text style={s.note}>
          Resolución mensual: sin datos horarios. Valores REAL salvo indicación.{' '}
          <Text style={{ color: colors.primary, fontWeight: '600' }}>{showLegend ? 'Ocultar' : '¿Qué significan las etiquetas?'}</Text>
        </Text>
      </Pressable>
      {showLegend ? (
        <View style={s.legend}>
          {(Object.keys(d.quality_legend) as Metric['quality'][]).map((q) => (
            <View key={q} style={[s.row, { gap: 6, alignItems: 'flex-start', justifyContent: 'flex-start' }]}>
              <QualityBadge quality={q} always />
              <Text style={[s.note, { flex: 1 }]}>{d.quality_legend[q]}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </>
  );
}

export function DashboardScreen({
  onAddBill,
  onOpenAlerts,
  onAddReading,
  onEditGoal,
}: {
  onAddBill?: () => void;
  onOpenAlerts?: () => void;
  onAddReading?: () => void;
  onEditGoal?: () => void;
}) {
  const homeId = useSession((st) => st.selectedHomeId);
  const { data, isLoading, isError, error, refetch, isRefetching } = useDashboard(homeId);
  const bills = useBills(homeId);
  const goal = useGoalProgress(homeId);

  if (!homeId)
    return <EmptyState icon="home-outline" title="Seleccione una vivienda" hint="Toque el nombre de la vivienda arriba para elegirla." />;
  if (isLoading) return <LoadingSkeleton label="Cargando el resumen…" variant="dashboard" count={1} />;
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data) return <EmptyState title="Sin datos" />;

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={() => {
            void refetch();
            void bills.refetch();
            void goal.refetch();
          }}
        />
      }
    >
      <View>
        <Text style={s.home} accessibilityRole="header">
          {data.home.name}
        </Text>
        <Text style={s.homeMeta}>{data.home.distributor}</Text>
      </View>
      {data.latest_bill === null ? (
        <EmptyState
          title="Aún no hay facturas"
          hint="Registre su última factura de luz para ver su consumo, la proyección y las alertas."
          action={onAddBill ? <Button title="Registrar factura" onPress={onAddBill} testID="add-bill-empty" /> : null}
        />
      ) : null}
      <DashboardView
        d={data}
        bills={bills.data}
        onAddBill={onAddBill}
        onOpenAlerts={onOpenAlerts}
        goalSlot={<GoalCard query={goal} onEdit={onEditGoal} onAddReading={onAddReading} onAddBill={onAddBill} />}
      />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  home: { fontSize: 22, fontWeight: '700', color: colors.text },
  homeMeta: { color: colors.muted },
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.text, flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  label: { color: colors.muted, fontSize: 14 },
  value: { color: colors.text, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  note: { color: colors.muted, fontSize: 12 },
  demo: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.warningBg, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 6 },
  demoText: { color: colors.warning, fontSize: 12, flex: 1 },
  hero: { backgroundColor: colors.brandDark, borderRadius: radius.lg, padding: spacing.lg, gap: 4 },
  heroLabel: { color: colors.onBrandMuted, fontSize: 13 },
  heroValue: { color: colors.onBrand, fontSize: 34, fontWeight: '800', fontVariant: ['tabular-nums'] },
  heroMeta: { color: colors.onBrandMuted, fontSize: 13, fontVariant: ['tabular-nums'] },
  heroCta: {
    marginTop: spacing.md,
    minHeight: TOUCH,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  heroCtaText: { color: colors.brandDark, fontWeight: '700', fontSize: 15 },
  legendToggle: { minHeight: TOUCH, justifyContent: 'center' },
  legend: { gap: 6 },
});
