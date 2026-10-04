import { Alert as RNAlert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../api/client';
import { useDeleteEquipment, useEquipment, useEstimate } from '../api/hooks';
import type { EquipmentEstimate } from '../api/types';
import { Button, EmptyView, ErrorView, Loading, QualityBadge } from '../components/ui';
import { fmtNumber } from '../lib/format';
import { useSession } from '../store/session';
import { colors, spacing } from '../theme';

function EstimateSummary({ e }: { e: EquipmentEstimate }) {
  return (
    <View style={s.card} testID="estimate-summary">
      <View style={s.row}>
        <Text style={s.title}>Consumo estimado de equipos</Text>
        <QualityBadge quality="ESTIMATED" />
      </View>
      <View style={s.row}>
        <Text style={s.label}>Por día</Text>
        <Text style={s.value}>{fmtNumber(e.total_daily_kwh.value)} kWh</Text>
      </View>
      <View style={s.row}>
        <Text style={s.label}>Por mes ({e.days_per_month} días)</Text>
        <Text style={s.value} testID="estimate-monthly">{fmtNumber(e.total_monthly_kwh.value)} kWh</Text>
      </View>
      {e.latest_bill_kwh ? (
        <View style={s.row}>
          <Text style={s.label}>Última factura</Text>
          <View style={[s.row, { gap: 6 }]}>
            <Text style={s.value}>{fmtNumber(e.latest_bill_kwh.value)} kWh</Text>
            <QualityBadge quality={e.latest_bill_kwh.quality} />
          </View>
        </View>
      ) : null}
      {e.bill_coverage_pct ? (
        <View style={s.row}>
          <Text style={s.label}>Explica de la factura</Text>
          <View style={[s.row, { gap: 6 }]}>
            <Text style={s.value}>{fmtNumber(e.bill_coverage_pct.value)}%</Text>
            <QualityBadge quality={e.bill_coverage_pct.quality} />
          </View>
        </View>
      ) : null}
      <Text style={s.note}>{e.note}</Text>
    </View>
  );
}

export function EquipmentScreen({ onAdd, onEdit }: { onAdd: () => void; onEdit: (id: string) => void }) {
  const homeId = useSession((st) => st.selectedHomeId);
  const list = useEquipment(homeId);
  const estimate = useEstimate(homeId);
  const del = useDeleteEquipment(homeId ?? '');

  if (!homeId) return <EmptyView title="Seleccione una vivienda" hint="Elija una vivienda en la pestaña Viviendas." />;
  if (list.isLoading || estimate.isLoading) return <Loading label="Cargando equipos…" />;
  if (list.isError) return <ErrorView error={list.error} onRetry={() => void list.refetch()} />;
  if (estimate.isError) return <ErrorView error={estimate.error} onRetry={() => void estimate.refetch()} />;

  const byId = new Map((estimate.data?.items ?? []).map((i) => [i.equipment_id, i]));
  const confirmDelete = (id: string, name: string) =>
    RNAlert.alert('Eliminar equipo', `¿Eliminar "${name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () =>
          del.mutate(id, {
            onError: (e) => RNAlert.alert('No se pudo eliminar', e instanceof ApiError ? e.message : 'Intente de nuevo'),
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
        ListHeaderComponent={estimate.data && (list.data?.length ?? 0) > 0 ? <EstimateSummary e={estimate.data} /> : null}
        ListEmptyComponent={
          <EmptyView
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
                  ≈ {fmtNumber(est.monthly_kwh.value)} kWh/mes ({fmtNumber(est.daily_kwh.value)} kWh/día)
                </Text>
              ) : null}
              <View style={[s.row, { justifyContent: 'flex-end', gap: spacing.lg }]}>
                <Text style={s.link} onPress={() => onEdit(item.id)} accessibilityRole="button">
                  Editar
                </Text>
                <Text style={s.del} onPress={() => confirmDelete(item.id, item.name)} accessibilityRole="button">
                  Eliminar
                </Text>
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
  card: { backgroundColor: colors.card, borderRadius: 12, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontWeight: '700', color: colors.text, fontSize: 15, flexShrink: 1 },
  label: { color: colors.muted, fontSize: 13 },
  value: { color: colors.text, fontWeight: '600', fontSize: 14 },
  note: { color: colors.muted, fontSize: 12, marginTop: 4 },
  link: { color: colors.primary, fontWeight: '600', fontSize: 13 },
  del: { color: colors.danger, fontWeight: '600', fontSize: 13 },
  footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card },
});
