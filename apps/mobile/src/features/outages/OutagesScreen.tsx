import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { useDeleteOutage, useOutages, useOutageSummary, useUpdateOutage } from '../../api/hooks';
import type { Outage } from '../../api/types';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../components/states';
import { Button, TextAction } from '../../components/ui';
import { useSession } from '../../store/session';
import { colors, radius, spacing } from '../../theme';
import { outageErrorMessage, outageRow, summaryHeadline, summaryRows } from './outagesModel';

export function OutagesScreen({ onAdd, onEdit }: { onAdd: () => void; onEdit: (outageId: string) => void }) {
  const homeId = useSession((st) => st.selectedHomeId);
  const list = useOutages(homeId);
  const summary = useOutageSummary(homeId, 12);
  const remove = useDeleteOutage(homeId ?? '');
  const update = useUpdateOutage(homeId ?? '');

  if (!homeId) return <EmptyState icon="home-outline" title="Seleccione una vivienda" hint="Elija una vivienda antes de ver sus apagones." />;
  if (list.isLoading) return <LoadingSkeleton label="Cargando apagones…" />;
  if (list.isError) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;

  const confirmDelete = (o: Outage) => {
    const when = outageRow(o).when;
    Alert.alert('Eliminar apagón', `¿Eliminar el apagón del ${when}? El resumen mensual se recalcula.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => remove.mutate(o.id, { onError: (e) => Alert.alert('No se pudo eliminar', outageErrorMessage(e)) }) },
    ]);
  };
  const restore = (o: Outage) => update.mutate(
    { id: o.id, input: { started_at: o.started_at, ended_at: new Date().toISOString(), cause: o.cause, note: o.note } },
    { onError: (e) => Alert.alert('No se pudo actualizar', outageErrorMessage(e)) },
  );

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      data={list.data ?? []}
      keyExtractor={(o) => o.id}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => { void list.refetch(); void summary.refetch(); }} />}
      ListHeaderComponent={
        <View style={{ gap: spacing.md }}>
          <Text style={s.intro}>Anote cuándo se va y cuándo vuelve la luz. Son datos que usted registra: no se verifican con la distribuidora.</Text>
          <Button title="Registrar apagón" onPress={onAdd} testID="add-outage" />
          {summary.data ? (
            <View style={s.card} testID="outage-summary">
              <Text style={s.cardTitle} accessibilityRole="header">{summaryHeadline(summary.data)}</Text>
              {summaryRows(summary.data).map((r) => (
                <View key={r.month} style={s.monthRow} accessible accessibilityLabel={r.accessibilityLabel}>
                  <Text style={s.month}>{r.month}</Text>
                  <Text style={s.monthText}>{r.text}</Text>
                </View>
              ))}
              <Text style={s.note}>{summary.data.note}</Text>
            </View>
          ) : null}
        </View>
      }
      ListEmptyComponent={<EmptyState icon="flash-off-outline" title="Aún no hay apagones registrados" hint="Cuando se vaya la luz, regístrelo con el botón de arriba." testID="outages-empty" />}
      renderItem={({ item }) => {
        const row = outageRow(item);
        return (
          <View style={s.item} testID={row.testID} accessible accessibilityLabel={row.accessibilityLabel}>
            <Text style={s.when}>{row.when}</Text>
            <Text style={s.summary}>{row.summary}</Text>
            {row.note ? <Text style={s.noteText}>{row.note}</Text> : null}
            <View style={s.actions}>
              {row.ongoing ? <TextAction title="Ya volvió la luz" testID={`restore-${item.id}`} onPress={() => restore(item)} /> : null}
              <TextAction title="Editar" testID={`edit-${item.id}`} onPress={() => onEdit(item.id)} accessibilityLabel={`Editar el apagón del ${row.when}`} />
              <TextAction title="Eliminar" tone="danger" testID={`delete-${item.id}`} onPress={() => confirmDelete(item)} accessibilityLabel={`Eliminar el apagón del ${row.when}`} />
            </View>
          </View>
        );
      }}
    />
  );
}

const s = StyleSheet.create({
  intro: { color: colors.muted, fontSize: 13 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  monthRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  month: { fontSize: 14, fontWeight: '600', color: colors.text },
  monthText: { fontSize: 14, color: colors.muted, flexShrink: 1, textAlign: 'right' },
  note: { fontSize: 12, color: colors.muted },
  item: { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.xs },
  when: { fontSize: 14, fontWeight: '700', color: colors.text },
  summary: { fontSize: 14, color: colors.text },
  noteText: { fontSize: 13, color: colors.muted },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
});
