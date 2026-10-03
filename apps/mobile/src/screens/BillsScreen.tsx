import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../api/client';
import { useBills, useDeleteBill } from '../api/hooks';
import type { Bill } from '../api/types';
import { Button, EmptyView, ErrorView, Loading } from '../components/ui';
import { fmtDop, fmtKwh, fmtPeriod } from '../lib/format';
import { useSession } from '../store/session';
import { colors, spacing } from '../theme';

export function BillsScreen({ onAdd }: { onAdd: () => void }) {
  const homeId = useSession((st) => st.selectedHomeId);
  const { data, isLoading, isError, error, refetch, isRefetching } = useBills(homeId);
  const del = useDeleteBill(homeId ?? '');

  if (!homeId)
    return <EmptyView title="Seleccione una vivienda" hint="Elija una vivienda en la pestaña Viviendas." />;
  if (isLoading) return <Loading label="Cargando facturas…" />;
  if (isError) return <ErrorView error={error} onRetry={() => void refetch()} />;

  const confirmDelete = (b: Bill) =>
    Alert.alert('Eliminar factura', `¿Eliminar la factura de ${fmtPeriod(b.period_start, b.period_end)}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () =>
          del.mutate(b.id, {
            onError: (e) => Alert.alert('No se pudo eliminar', e instanceof ApiError ? e.message : 'Intente de nuevo'),
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
        ListEmptyComponent={
          <EmptyView title="Sin facturas todavía" hint="Registre la primera factura de esta vivienda." />
        }
        renderItem={({ item }) => (
          <View style={s.card} testID={`bill-${item.period_start}`}>
            <View style={s.row}>
              <Text style={s.period}>{fmtPeriod(item.period_start, item.period_end)}</Text>
              {item.source === 'seed' ? <Text style={s.demo}>DEMO</Text> : null}
            </View>
            <Text style={s.main}>{fmtKwh(item.kwh)} · {fmtDop(item.amount_dop)}</Text>
            <View style={s.row}>
              <Text style={s.meta}>{item.days} días</Text>
              {item.source === 'manual' ? (
                <Text style={s.del} onPress={() => confirmDelete(item)} accessibilityRole="button">
                  Eliminar
                </Text>
              ) : null}
            </View>
          </View>
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
  card: { backgroundColor: colors.card, borderRadius: 12, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  period: { fontWeight: '600', color: colors.text },
  main: { fontSize: 16, color: colors.text },
  meta: { color: colors.muted, fontSize: 13 },
  demo: { fontSize: 10, fontWeight: '700', color: colors.warning, backgroundColor: colors.warningBg, paddingHorizontal: 6, borderRadius: 999 },
  del: { color: colors.danger, fontWeight: '600', fontSize: 13 },
  footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card },
});
