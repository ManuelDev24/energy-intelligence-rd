import { fmtNumber } from '@energyrd/core';
import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { useDecidedRecommendations, useRecommendations, useUpdateRecommendation } from '../../api/hooks';
import type { Recommendation } from '../../api/types';
import { AlertCard } from '../../components/AlertCard';
import { QualityBadge } from '../../components/DataStatusBadge';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../components/states';
import { TextAction } from '../../components/ui';
import { useSession } from '../../store/session';
import { colors, radius, spacing } from '../../theme';
import { recommendationRow, savingsAction, type SavingsNav } from './savingsModel';

function Item({ item, nav, pending, onApply, onDismiss, onRestore }: {
  item: Recommendation; nav: SavingsNav; pending: boolean;
  onApply?: () => void; onDismiss?: () => void; onRestore?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { view, target, tone } = recommendationRow(item);
  const go = savingsAction(target, nav);
  return (
    <View testID={`reco-${item.id}`}>
      <AlertCard
        tone={tone}
        title={view.title}
        trailing={view.savings ? `${view.savings} · ESTIMADO` : undefined}
        message={`${view.summary}\n${view.action}`}
        meta={`${view.category} · ${view.confidence}`}
        actions={
          <>
            {go ? <TextAction title={target.label} testID={`reco-go-${item.id}`} onPress={go} /> : null}
            <TextAction title={open ? 'Ocultar por qué' : '¿Por qué se recomienda?'} testID={`reco-why-${item.id}`} onPress={() => setOpen((v) => !v)} accessibilityLabel={`${open ? 'Ocultar' : 'Ver'} por qué se recomienda: ${view.title}`} />
            {onApply && !pending ? <TextAction title="Ya la apliqué" testID={`reco-apply-${item.id}`} onPress={onApply} accessibilityLabel={`Marcar como aplicada: ${view.title}`} /> : null}
            {onDismiss && !pending ? <TextAction title="Descartar" tone="muted" testID={`reco-dismiss-${item.id}`} onPress={onDismiss} accessibilityLabel={`Descartar: ${view.title}`} /> : null}
            {onRestore && !pending ? <TextAction title="Volver a activar" testID={`reco-restore-${item.id}`} onPress={onRestore} accessibilityLabel={`Volver a activar: ${view.title}`} /> : null}
          </>
        }
      />
      {open ? (
        <View style={s.why} testID={`reco-explain-${item.id}`}>
          <Text style={s.whyText}>{view.confidenceHelp}</Text>
          {view.assumptions.map((a) => <Text key={a} style={s.whyText}>• {a}</Text>)}
          <Text style={s.whyText}>Regla: {view.rule}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function SavingsScreen(nav: SavingsNav = {}) {
  const homeId = useSession((st) => st.selectedHomeId);
  const { data, isLoading, isError, error, refetch, isRefetching } = useRecommendations(homeId);
  const decided = useDecidedRecommendations(homeId);
  const update = useUpdateRecommendation(homeId);
  const set = (r: Recommendation, status: 'active' | 'applied' | 'dismissed') => update.mutate({ id: r.id, status });

  if (!homeId)
    return <EmptyState icon="home-outline" title="Seleccione una vivienda" hint="Elija una vivienda en la pestaña Viviendas." />;
  if (isLoading) return <LoadingSkeleton label="Buscando dónde ahorrar…" count={2} />;
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <View style={s.screen}>
      {update.isError ? (
        <Text style={s.mutErr} accessibilityRole="alert" testID="reco-update-error">No se pudo actualizar la recomendación. Intente de nuevo.</Text>
      ) : null}
      <FlatList
        data={data?.items ?? []}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { void refetch(); void decided.refetch(); }} />}
        ListHeaderComponent={
          <View style={{ gap: spacing.sm }}>
            <Text style={s.intro}>Cada recomendación explica por qué se sugiere y qué se supuso. Los ahorros son estimaciones, no garantías.</Text>
            {data?.total_savings_kwh_month ? (
              <View style={s.total} testID="savings-total" accessible accessibilityLabel={`Ahorro potencial estimado: ${fmtNumber(data.total_savings_kwh_month.value, 0)} kilovatios hora al mes`}>
                <Text style={s.totalLabel}>Ahorro potencial si aplica lo de equipos</Text>
                <Text style={s.totalValue}>
                  ≈ {fmtNumber(data.total_savings_kwh_month.value, 0)} kWh al mes
                  {data.total_savings_dop_month ? ` · ≈ RD$ ${fmtNumber(data.total_savings_dop_month.value, 0)}` : ''}
                </Text>
                <QualityBadge quality="ESTIMATED" always />
                <Text style={s.note}>{data.note}</Text>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <EmptyState icon="leaf-outline" title="Sin recomendaciones por ahora" hint="Declare sus equipos y registre sus facturas: con eso podemos decirle dónde ahorrar." />
        }
        renderItem={({ item }) => (
          <Item item={item} nav={nav} pending={update.isPending} onApply={() => set(item, 'applied')} onDismiss={() => set(item, 'dismissed')} />
        )}
        ListFooterComponent={
          decided.data && decided.data.length > 0 ? (
            <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
              <Text style={s.section} accessibilityRole="header">Aplicadas y descartadas ({decided.data.length})</Text>
              {decided.data.map((r) => <Item key={r.id} item={r} nav={nav} pending={update.isPending} onRestore={() => set(r, 'active')} />)}
            </View>
          ) : null
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  mutErr: { color: colors.danger, backgroundColor: colors.dangerBg, padding: spacing.md },
  intro: { color: colors.muted, fontSize: 14 },
  total: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.xs, alignItems: 'flex-start' },
  totalLabel: { color: colors.muted, fontSize: 13 },
  totalValue: { color: colors.text, fontSize: 22, fontWeight: '700' },
  note: { color: colors.muted, fontSize: 12 },
  why: { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs, marginTop: -spacing.xs },
  whyText: { color: colors.muted, fontSize: 13 },
  section: { fontSize: 16, fontWeight: '700', color: colors.text },
});
