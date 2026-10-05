import { Alert as RNAlert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { describeError } from '../../api/errors';
import { useDeleteEquipment, useEquipment, useEstimate } from '../../api/hooks';
import type { EquipmentEstimate } from '../../api/types';
import { EquipmentBreakdown } from '../../components/charts/EquipmentBreakdown';
import { MetricCard } from '../../components/MetricCard';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../components/states';
import { Button, QualityBadge, TextAction } from '../../components/ui';
import { fmtNumber, fmtMetric } from '../../lib/format';
import { metricParts } from '../../lib/metricParts';
import { useSession } from '../../store/session';
import { colors, radius, spacing } from '../../theme';

function EstimateSummary({ e }: { e: EquipmentEstimate }) {
  return (
    <View style={s.card} testID="estimate-summary">
      <View style={s.row}>
        <Text style={s.title} accessibilityRole="header">
          Consumo estimado de equipos
        </Text>
        <QualityBadge quality="ESTIMATED" />
      </View>
      <View style={s.grid}>
        <MetricCard
          label="Por día"
          {...metricParts(e.total_daily_kwh.value, 'kWh')}
          quality={e.total_daily_kwh.quality}
          testID="estimate-daily"
        />
        <MetricCard
          label={`Por mes (${e.days_per_month} días)`}
          {...metricParts(e.total_monthly_kwh.value, 'kWh')}
          quality={e.total_monthly_kwh.quality}
          testID="estimate-monthly"
        />
        {e.latest_bill_kwh ? (
          <MetricCard
            label="Última factura"
            {...metricParts(e.latest_bill_kwh.value, 'kWh')}
            quality={e.latest_bill_kwh.quality}
            helper="Lo que marcó el contador."
          />
        ) : null}
        {e.bill_coverage_pct ? (
          <MetricCard
            label="Explica de la factura"
            {...metricParts(e.bill_coverage_pct.value, '%')}
            quality={e.bill_coverage_pct.quality}
            helper="Parte de la factura que explican sus equipos."
          />
        ) : null}
      </View>
      <Text style={s.note}>{e.note}</Text>
    </View>
  );
}

export function EquipmentScreen({ onAdd, onEdit }: { onAdd: () => void; onEdit: (id: string) => void }) {
  const homeId = useSession((st) => st.selectedHomeId);
  const list = useEquipment(homeId);
  const estimate = useEstimate(homeId);
  const del = useDeleteEquipment(homeId ?? '');

  if (!homeId)
    return <EmptyState icon="home-outline" title="Seleccione una vivienda" hint="Elija una vivienda en la pestaña Viviendas." />;
  if (list.isLoading || estimate.isLoading) return <LoadingSkeleton label="Cargando equipos…" />;
  if (list.isError) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
  if (estimate.isError) return <ErrorState error={estimate.error} onRetry={() => void estimate.refetch()} />;

  const byId = new Map((estimate.data?.items ?? []).map((i) => [i.equipment_id, i]));
  const hasEquipment = (list.data?.length ?? 0) > 0;
  const confirmDelete = (id: string, name: string) =>
    RNAlert.alert('Eliminar equipo', `¿Eliminar "${name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () =>
          del.mutate(id, {
            onError: (e) => RNAlert.alert('No se pudo eliminar', describeError(e).message),
          }),
      },
    ]);

  return (
    <View style={s.screen}>
      <FlatList
        data={list.data ?? []}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={list.isRefetching || estimate.isRefetching}
            onRefresh={() => {
              void list.refetch();
              void estimate.refetch();
            }}
          />
        }
        ListHeaderComponent={
          estimate.data && hasEquipment ? (
            <View style={{ gap: spacing.md }}>
              <EstimateSummary e={estimate.data} />
              {estimate.data.items.length > 0 ? <EquipmentBreakdown estimate={estimate.data} /> : null}
            </View>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="tv-outline"
            title="Sin equipos declarados"
            hint="Agregue los equipos de la vivienda (nevera, aire, abanicos…) para estimar su consumo."
          />
        }
        renderItem={({ item }) => {
          const est = byId.get(item.id);
          return (
            <View style={s.card} testID={`equipment-${item.name}`}>
              <View style={s.row}>
                <Text style={s.title}>{item.name}</Text>
                {est ? <QualityBadge quality={est.monthly_kwh.quality} /> : null}
              </View>
              <Text style={s.label}>
                {item.room ? `${item.room} · ` : ''}
                {fmtNumber(item.power_w, 0)} W · {fmtNumber(item.hours_per_day, Number(item.hours_per_day) % 1 ? 2 : 0)} h/día
              </Text>
              {est ? (
                <Text style={s.value}>
                  ≈ {fmtMetric(est.monthly_kwh.value, 'kWh')}/mes ({fmtNumber(est.daily_kwh.value)} kWh/día)
                </Text>
              ) : null}
              <View style={[s.row, { justifyContent: 'flex-end', gap: spacing.md }]}>
                <TextAction title="Editar" onPress={() => onEdit(item.id)} accessibilityLabel={`Editar ${item.name}`} />
                <TextAction
                  title="Eliminar"
                  tone="danger"
                  onPress={() => confirmDelete(item.id, item.name)}
                  accessibilityLabel={`Eliminar ${item.name}`}
                />
              </View>
            </View>
          );
        }}
      />
      <View style={s.footer}>
        <Button title="Agregar equipo" onPress={onAdd} testID="add-equipment" />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  title: { fontWeight: '700', color: colors.text, fontSize: 15, flexShrink: 1 },
  label: { color: colors.muted, fontSize: 13 },
  value: { color: colors.text, fontWeight: '600', fontSize: 14, fontVariant: ['tabular-nums'] },
  note: { color: colors.muted, fontSize: 12, marginTop: 4 },
  footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card },
});
