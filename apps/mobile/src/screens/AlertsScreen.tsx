import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { useAlerts, useSetAlertStatus } from '../api/hooks';
import { EmptyView, ErrorView, Loading } from '../components/ui';
import { fmtNumber, fmtPeriod } from '../lib/format';
import { useSession } from '../store/session';
import { colors, spacing } from '../theme';

export { unreadCount } from '../lib/alerts';

export function AlertsScreen() {
  const homeId = useSession((st) => st.selectedHomeId);
  const { data, isLoading, isError, error, refetch, isRefetching } = useAlerts(homeId);
  const setStatus = useSetAlertStatus(homeId ?? '');

  if (!homeId) return <EmptyView title="Seleccione una vivienda" hint="Elija una vivienda en la pestaña Viviendas." />;
  if (isLoading) return <Loading label="Cargando alertas…" />;
  if (isError) return <ErrorView error={error} onRetry={() => void refetch()} />;

  return (
    <View style={s.screen}>
      {setStatus.isError ? (
        <Text style={s.mutErr} accessibilityRole="alert" testID="alert-update-error">
          No se pudo actualizar la alerta. Intente de nuevo.
        </Text>
      ) : null}
      <FlatList
        data={data ?? []}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
        ListEmptyComponent={
          <EmptyView
            title="Sin alertas"
            hint="Se genera una alerta cuando el consumo de una factura sube por encima del umbral frente a la anterior."
          />
        }
        renderItem={({ item }) => {
          const critical = item.severity === 'critical';
          const unread = item.status === 'unread';
          return (
            <View
              style={[s.card, { borderLeftColor: critical ? colors.danger : colors.warning }, unread && s.unread]}
              testID={`alert-${item.id}`}
            >
              <View style={s.row}>
                <Text style={[s.sev, { color: critical ? colors.danger : colors.warning }]}>
                  {critical ? 'Crítica' : 'Advertencia'}
                  {unread ? ' · nueva' : ''}
                </Text>
                {item.kwh_pct ? <Text style={s.pct}>+{fmtNumber(item.kwh_pct)}%</Text> : null}
              </View>
              <Text style={s.msg}>{item.message}</Text>
              {item.basis_period_start && item.basis_period_end ? (
                <Text style={s.meta}>
                  Período base: {fmtPeriod(item.basis_period_start, item.basis_period_end)}
                  {item.threshold_pct ? ` · umbral ${fmtNumber(item.threshold_pct, 0)}%` : ''}
                </Text>
              ) : null}
              <View style={[s.row, { justifyContent: 'flex-end', gap: spacing.lg }]}>
                {unread ? (
                  <Text style={s.link} accessibilityRole="button" testID={`read-${item.id}`}
                    onPress={() => setStatus.mutate({ id: item.id, status: 'read' })}>
                    Marcar como leída
                  </Text>
                ) : null}
                <Text style={s.dismiss} accessibilityRole="button" testID={`dismiss-${item.id}`}
                  onPress={() => setStatus.mutate({ id: item.id, status: 'dismissed' })}>
                  Descartar
                </Text>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  card: {
    backgroundColor: colors.card, borderRadius: 12, padding: spacing.lg, borderWidth: 1,
    borderColor: colors.border, borderLeftWidth: 4, gap: 6,
  },
  unread: { backgroundColor: '#FFFBEB' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sev: { fontWeight: '700', fontSize: 13 },
  pct: { fontWeight: '700', color: colors.text },
  msg: { color: colors.text, fontSize: 15 },
  meta: { color: colors.muted, fontSize: 12 },
  link: { color: colors.primary, fontWeight: '600', fontSize: 13 },
  dismiss: { color: colors.muted, fontWeight: '600', fontSize: 13 },
  mutErr: { color: colors.danger, backgroundColor: colors.dangerBg, padding: spacing.md },
});
