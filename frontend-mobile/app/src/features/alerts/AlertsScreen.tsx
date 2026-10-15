import { alertTarget, alertTitle, SEVERITY } from '@energyrd/core';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { useAlerts, useSetAlertStatus } from '../../api/hooks';
import { AlertCard } from '../../components/AlertCard';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../components/states';
import { TextAction } from '../../components/ui';
import { fmtNumber, fmtPeriod, fmtPct } from '../../lib/format';
import { useSession } from '../../store/session';
import { colors, spacing } from '../../theme';

export { sortAlerts, unreadCount } from '../../lib/alerts';
import { sortAlerts } from '../../lib/alerts';

export interface AlertsNav {
  onOpenBill?: (billId: string) => void;
  onNewBill?: () => void;
  onNewReading?: () => void;
  onHome?: () => void;
}

export function AlertsScreen({ onOpenBill, onNewBill, onNewReading, onHome }: AlertsNav = {}) {
  const homeId = useSession((st) => st.selectedHomeId);
  const { data, isLoading, isError, error, refetch, isRefetching } = useAlerts(homeId);
  const setStatus = useSetAlertStatus(homeId ?? '');

  if (!homeId)
    return <EmptyState icon="home-outline" title="Seleccione una vivienda" hint="Elija una vivienda en la pestaña Viviendas." />;
  if (isLoading) return <LoadingSkeleton label="Cargando alertas…" count={2} />;
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <View style={s.screen}>
      {setStatus.isError ? (
        <Text style={s.mutErr} accessibilityRole="alert" testID="alert-update-error">
          No se pudo actualizar la alerta. Intente de nuevo.
        </Text>
      ) : null}
      <FlatList
        data={sortAlerts(data ?? [])}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
        ListEmptyComponent={
          <EmptyState
            icon="checkmark-circle-outline"
            title="Sin alertas"
            hint="Le avisaremos si el consumo sube de golpe, si se detecta una desviación o si una factura está por vencer."
          />
        }
        renderItem={({ item }) => {
          const unread = item.status === 'unread';
          const sev = SEVERITY[item.severity];
          const target = alertTarget(item);
          const go = !target ? null : target.kind === 'bill' ? () => onOpenBill?.(target.billId) : target.kind === 'new-bill' ? onNewBill : target.kind === 'new-reading' ? onNewReading : onHome;
          return (
            <AlertCard
              tone={item.severity}
              testID={`alert-${item.id}`}
              title={`${sev.short}: ${alertTitle(item)}${unread ? ' · nueva' : ''}`}
              trailing={item.kwh_pct ? fmtPct(item.kwh_pct) : undefined}
              message={item.message}
              highlighted={unread}
              meta={
                item.basis_period_start && item.basis_period_end
                  ? `Período base: ${fmtPeriod(item.basis_period_start, item.basis_period_end)}${
                      item.threshold_pct ? ` · umbral ${fmtNumber(item.threshold_pct, 0)}%` : ''
                    }`
                  : undefined
              }
              actions={
                <>
                  {target && go ? <TextAction title={target.label} testID={`open-${item.id}`} onPress={go} /> : null}
                  {unread ? (
                    <TextAction
                      title="Marcar como leída"
                      testID={`read-${item.id}`}
                      onPress={() => setStatus.mutate({ id: item.id, status: 'read' })}
                    />
                  ) : null}
                  <TextAction
                    title="Descartar"
                    tone="muted"
                    testID={`dismiss-${item.id}`}
                    onPress={() => setStatus.mutate({ id: item.id, status: 'dismissed' })}
                  />
                </>
              }
            />
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  mutErr: { color: colors.danger, backgroundColor: colors.dangerBg, padding: spacing.md },
});
