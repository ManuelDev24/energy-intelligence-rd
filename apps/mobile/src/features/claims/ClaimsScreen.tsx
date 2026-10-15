// ERD-CLAIM-01-MOBILE: lista de reclamaciones. Es un registro de la persona; no afirma errores de la distribuidora.
import { CLAIM_KIND_LABEL, CLAIM_STATUS_LABEL } from '@energyrd/core';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { useClaims } from '../../api/hooks';
import { Button } from '../../components/Button';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../components/states';
import { useSession } from '../../store/session';
import { colors, radius, spacing, TOUCH } from '../../theme';
import { shortDate } from './model';

export function ClaimsScreen({ onNew, onOpen }: { onNew: () => void; onOpen: (claimId: string) => void }) {
  const homeId = useSession((st) => st.selectedHomeId);
  const { data, isLoading, isError, error, refetch, isRefetching } = useClaims(homeId);
  if (!homeId) return <EmptyState icon="home-outline" title="Seleccione una vivienda" hint="Las reclamaciones son de la vivienda activa." />;
  if (isLoading) return <LoadingSkeleton label="Cargando reclamaciones…" count={2} />;
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
  return (
    <FlatList
      data={data ?? []} keyExtractor={(c) => c.id} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, flexGrow: 1 }} style={{ backgroundColor: colors.bg }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />} testID="claims-list"
      ListHeaderComponent={<View style={{ gap: spacing.sm }}>
        <Text style={s.muted}>Lleva el seguimiento de un caso con tu distribuidora. Guardamos un resumen de tus datos; no afirma que haya un error de la distribuidora. La reclamación formal la presentas tú.</Text>
        <Button title="Nueva reclamación" onPress={onNew} testID="claims-new" />
      </View>}
      ListEmptyComponent={<EmptyState icon="chatbubble-ellipses-outline" title="Aún no tienes reclamaciones" hint="Si tienes dudas sobre un cobro o el servicio, crea un caso." compact />}
      renderItem={({ item }) => (
        <Pressable accessibilityRole="button" accessibilityLabel={`${item.subject}. ${CLAIM_STATUS_LABEL[item.status]}. ${CLAIM_KIND_LABEL[item.kind]}`} onPress={() => onOpen(item.id)} style={s.card} testID={`claim-${item.id}`}>
          <Text style={s.title}>{item.subject}</Text>
          <Text style={s.muted}>{CLAIM_KIND_LABEL[item.kind]} · {CLAIM_STATUS_LABEL[item.status]} · {shortDate(item.created_at)}</Text>
        </Pressable>
      )}
    />
  );
}

const s = StyleSheet.create({
  muted: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  card: { minHeight: TOUCH, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: 4 },
});
