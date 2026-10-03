import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useDashboard } from '../api/hooks';
import type { Dashboard, Metric } from '../api/types';
import { EmptyView, ErrorView, Loading, QualityBadge } from '../components/ui';
import { fmtDop, fmtKwh, fmtNumber, fmtPeriod, fmtSigned } from '../lib/format';
import { useSession } from '../store/session';
import { colors, spacing } from '../theme';

function Card({ title, quality, children, testID }: { title: string; quality?: Metric['quality']; children: React.ReactNode; testID?: string }) {
  return (
    <View style={s.card} testID={testID}>
      <View style={s.row}>
        <Text style={s.cardTitle}>{title}</Text>
        {quality ? <QualityBadge quality={quality} /> : null}
      </View>
      {children}
    </View>
  );
}

function Row({ label, value, quality }: { label: string; value: string; quality?: Metric['quality'] }) {
  return (
    <View style={s.row}>
      <Text style={s.label}>{label}</Text>
      <View style={[s.row, { gap: 6 }]}>
        <Text style={s.value}>{value}</Text>
        {quality ? <QualityBadge quality={quality} /> : null}
      </View>
    </View>
  );
}

export function DashboardView({ d }: { d: Dashboard }) {
  const { latest_bill: lb, comparison: c, projection: p, alert, recommendation, data_status: ds } = d;
  return (
    <>
      {ds.is_demo ? (
        <View style={[s.banner, { backgroundColor: colors.warningBg }]} testID="demo-banner">
          <Text style={{ color: colors.warning, fontSize: 13 }}>
            Datos de demostración (seed). No son facturas reales del cliente.
          </Text>
        </View>
      ) : null}

      {alert ? (
        <View
          style={[s.banner, { backgroundColor: alert.severity === 'critical' ? colors.dangerBg : colors.warningBg }]}
          testID="alert-banner"
        >
          <Text style={{ fontWeight: '700', color: alert.severity === 'critical' ? colors.danger : colors.warning }}>
            {alert.severity === 'critical' ? 'Alerta crítica' : 'Alerta'}
          </Text>
          <Text style={{ color: colors.text, marginTop: 2 }}>{alert.message}</Text>
        </View>
      ) : null}

      {lb ? (
        <Card title={`Última factura · ${fmtPeriod(lb.period_start, lb.period_end)}`} testID="card-latest">
          <Row label="Consumo" value={fmtKwh(lb.kwh.value)} quality={lb.kwh.quality} />
          <Row label="Monto" value={fmtDop(lb.amount_dop.value)} quality={lb.amount_dop.quality} />
          {lb.avg_daily_kwh ? (
            <Row label="Promedio diario" value={`${fmtNumber(lb.avg_daily_kwh.value)} kWh/día`} quality={lb.avg_daily_kwh.quality} />
          ) : null}
          {lb.avg_price_per_kwh ? (
            <Row label="Precio medio" value={`RD$ ${fmtNumber(lb.avg_price_per_kwh.value)}/kWh`} quality={lb.avg_price_per_kwh.quality} />
          ) : null}
        </Card>
      ) : null}

      {c ? (
        <Card title={`Vs. período anterior (${fmtPeriod(c.previous_period_start, c.previous_period_end)})`} testID="card-comparison">
          <Row label="Δ Consumo" value={`${fmtSigned(c.kwh_delta.value)} kWh`} quality={c.kwh_delta.quality} />
          {c.kwh_pct ? <Row label="Δ Consumo %" value={fmtSigned(c.kwh_pct.value, '%')} quality={c.kwh_pct.quality} /> : null}
          <Row label="Δ Monto" value={`${fmtSigned(c.amount_delta.value)} RD$`} quality={c.amount_delta.quality} />
          {c.amount_pct ? <Row label="Δ Monto %" value={fmtSigned(c.amount_pct.value, '%')} quality={c.amount_pct.quality} /> : null}
        </Card>
      ) : null}

      {p ? (
        <Card title="Proyección próxima factura" testID="card-projection">
          <Row label="Consumo" value={fmtKwh(p.kwh.value)} quality={p.kwh.quality} />
          <Row label="Monto" value={fmtDop(p.amount_dop.value)} quality={p.amount_dop.quality} />
          <Text style={s.note}>
            {p.note} Basada en {p.bills_used} facturas.
          </Text>
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

      <Text style={s.note} testID="monthly-note">
        Resolución mensual: no se muestran datos horarios porque la fuente son facturas mensuales.
      </Text>
      <View style={s.legend}>
        {(Object.keys(d.quality_legend) as Metric['quality'][]).map((q) => (
          <View key={q} style={[s.row, { gap: 6, alignItems: 'flex-start' }]}>
            <QualityBadge quality={q} />
            <Text style={[s.note, { flex: 1 }]}>{d.quality_legend[q]}</Text>
          </View>
        ))}
      </View>
    </>
  );
}

export function DashboardScreen({ onGoHomes }: { onGoHomes?: () => void }) {
  const homeId = useSession((st) => st.selectedHomeId);
  const { data, isLoading, isError, error, refetch, isRefetching } = useDashboard(homeId);

  if (!homeId)
    return <EmptyView title="Seleccione una vivienda" hint="Elija una vivienda en la pestaña Viviendas." />;
  if (isLoading) return <Loading label="Cargando dashboard…" />;
  if (isError) return <ErrorView error={error} onRetry={() => void refetch()} />;
  if (!data) return <EmptyView title="Sin datos" />;

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
    >
      <Text style={s.home}>{data.home.name}</Text>
      <Text style={s.homeMeta}>{data.home.distributor}</Text>
      {data.latest_bill === null ? (
        <EmptyView title="Aún no hay facturas" hint="Registre su primera factura en la pestaña Facturas." />
      ) : null}
      <DashboardView d={data} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  home: { fontSize: 22, fontWeight: '700', color: colors.text },
  homeMeta: { color: colors.muted, marginTop: -8 },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.text, flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { color: colors.muted, fontSize: 14 },
  value: { color: colors.text, fontSize: 15, fontWeight: '600' },
  note: { color: colors.muted, fontSize: 12 },
  banner: { padding: spacing.md, borderRadius: 10 },
  legend: { gap: 6, marginTop: spacing.sm },
});
