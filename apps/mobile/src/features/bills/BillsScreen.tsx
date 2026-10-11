import { monthlySeries } from '@energyrd/core';
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { describeError } from '../../api/errors';
import { useBills, useDeleteBill } from '../../api/hooks';
import type { Bill } from '../../api/types';
import { BillCard } from '../../components/BillCard';
import { ConsumptionChart } from '../../components/charts/ConsumptionChart';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../components/states';
import { Button } from '../../components/ui';
import { fmtPeriod } from '../../lib/format';
import { useSession } from '../../store/session';
import { colors, radius, spacing } from '../../theme';

/** Historial (CH-01 sin proyección): solo facturas registradas, hasta 12. */
function BillsChart({ bills }: { bills: Bill[] }) {
  const series = monthlySeries(bills, null, 12);
  if (series.length < 2) return null;
  return (
    <View style={s.card} testID="bills-chart-card">
      <Text style={s.chartTitle} accessibilityRole="header">
        Historial de consumo (kWh)
      </Text>
      <ConsumptionChart series={series} testID="bills-chart" />
    </View>
  );
}

export function BillsScreen({ onAdd, onOpen }: { onAdd: () => void; onOpen?: (homeId: string, billId: string) => void }) {
  const homeId = useSession((st) => st.selectedHomeId);
  const { data, isLoading, isError, error, refetch, isRefetching } = useBills(homeId);
  const del = useDeleteBill(homeId ?? '');

  if (!homeId)
    return <EmptyState icon="home-outline" title="Seleccione una vivienda" hint="Elija una vivienda en la pestaña Viviendas." />;
  if (isLoading) return <LoadingSkeleton label="Cargando facturas…" />;
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const confirmDelete = (b: Bill) =>
    Alert.alert('Eliminar factura', `¿Eliminar la factura de ${fmtPeriod(b.period_start, b.period_end)}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () =>
          del.mutate(b.id, {
            onError: (e) => Alert.alert('No se pudo eliminar', describeError(e).message),
          }),
      },
    ]);

  return (
    <View style={s.screen}>
      <FlatList
        data={data ?? []}
        keyExtractor={(b) => b.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
        ListHeaderComponent={data && data.length > 1 ? <BillsChart bills={data} /> : null}
        ListEmptyComponent={
          <EmptyState icon="receipt-outline" title="Sin facturas todavía" hint="Registre la primera factura de esta vivienda." />
        }
        renderItem={({ item }) => (
          <BillCard bill={item} onOpen={onOpen ? () => onOpen(homeId, item.id) : undefined} onDelete={() => confirmDelete(item)} />
        )}
      />
      <View style={s.footer}>
        <Button title="Registrar factura" onPress={onAdd} testID="add-bill" />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: 4 },
  chartTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card },
});
