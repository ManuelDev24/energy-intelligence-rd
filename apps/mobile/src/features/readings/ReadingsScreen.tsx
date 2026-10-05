import type { Reading } from '@energyrd/api-contracts';
import { fmtKwh } from '@energyrd/core';
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { describeError } from '../../api/errors';
import { useDeleteReading, useReadings } from '../../api/hooks';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../components/states';
import { Button, TextAction } from '../../components/ui';
import { localParts } from '../../lib/rdTime';
import { useSession } from '../../store/session';
import { colors, radius, spacing } from '../../theme';
import { isEndpointUnavailable } from '../goals/model';

/** testID estable por fecha/hora local: reading-2026-10-01-0800. */
export const readingTestID = (r: Pick<Reading, 'read_at'>) => {
  const p = localParts(r.read_at);
  return p ? `reading-${p.date}-${p.time.replace(':', '')}` : 'reading-invalid';
};

export function ReadingsScreen({ onAdd }: { onAdd: () => void }) {
  const homeId = useSession((st) => st.selectedHomeId);
  const { data, isLoading, isError, error, refetch, isRefetching } = useReadings(homeId);
  const del = useDeleteReading(homeId ?? '');

  if (!homeId) return <EmptyState icon="home-outline" title="Seleccione una vivienda" hint="Elija una vivienda antes de ver sus lecturas." />;
  if (isLoading) return <LoadingSkeleton label="Cargando lecturas…" />;
  if (isError && isEndpointUnavailable(error))
    return (
      <EmptyState
        icon="cloud-offline-outline"
        title="Lecturas no disponibles"
        hint="Este servidor todavía no ofrece lecturas del medidor."
        testID="readings-unavailable"
      />
    );
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const confirmDelete = (r: Reading) => {
    const when = localParts(r.read_at)?.label ?? r.read_at;
    Alert.alert('Eliminar lectura', `¿Eliminar la lectura de ${fmtKwh(r.reading_kwh)} del ${when}? El consumo y la meta se recalculan.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => del.mutate(r.id, { onError: (e) => Alert.alert('No se pudo eliminar', describeError(e).message) }),
      },
    ]);
  };

  return (
    <View style={s.screen}>
      <FlatList
        data={data ?? []}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
        ListHeaderComponent={
          <Text style={s.hint}>
            Anote el número que marca el contador (kWh). Las lecturas deben ir en aumento; no se admite cambio de medidor.
          </Text>
        }
        ListEmptyComponent={
          <EmptyState
            icon="speedometer-outline"
            title="Sin lecturas todavía"
            hint="Con dos lecturas o más verá su consumo por día, semana o mes."
            testID="readings-empty"
          />
        }
        renderItem={({ item }) => {
          const when = localParts(item.read_at)?.label ?? item.read_at;
          return (
            <View style={s.card} testID={readingTestID(item)}>
              <View accessible accessibilityLabel={`Lectura del ${when}: ${fmtKwh(item.reading_kwh)}${item.note ? `. Nota: ${item.note}` : ''}`}>
                <Text style={s.when}>{when}</Text>
                <Text style={s.main}>{fmtKwh(item.reading_kwh)}</Text>
                {item.note ? <Text style={s.meta}>{item.note}</Text> : null}
              </View>
              <View style={s.rowEnd}>
                <TextAction
                  title={del.isPending && del.variables === item.id ? 'Eliminando…' : 'Eliminar'}
                  tone="danger"
                  onPress={() => confirmDelete(item)}
                  accessibilityLabel={`Eliminar la lectura del ${when}`}
                  testID={`${readingTestID(item)}-delete`}
                />
              </View>
            </View>
          );
        }}
      />
      <View style={s.footer}>
        <Button title="Registrar lectura" onPress={onAdd} testID="readings-add" />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  hint: { color: colors.muted, fontSize: 13 },
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: 2 },
  when: { fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  main: { fontSize: 16, color: colors.text, fontVariant: ['tabular-nums'] },
  meta: { color: colors.muted, fontSize: 13 },
  rowEnd: { flexDirection: 'row', justifyContent: 'flex-end' },
  footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card },
});
