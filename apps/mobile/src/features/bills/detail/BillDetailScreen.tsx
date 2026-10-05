import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useBills } from '../../../api/hooks';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../../components/states';
import { Button } from '../../../components/ui';
import { fmtPeriod } from '../../../lib/format';
import { useSession } from '../../../store/session';
import { colors, radius, spacing } from '../../../theme';
import { assessmentView, type ReviewTone } from './assessmentModel';
import { detailView, type DetailTone } from './detailModel';
import { useBillAssessment, useBillItems } from './hooks';
import { belongsToSelectedHome, detailScreenState } from './screenState';

type IconName = keyof typeof Ionicons.glyphMap;
const TONE: Record<DetailTone | ReviewTone, { fg: string; bg: string; border: string }> = {
  success: { fg: colors.success, bg: colors.successBg, border: colors.successBorder },
  warning: { fg: colors.warning, bg: colors.warningBg, border: colors.warningBorder },
  neutral: { fg: colors.muted, bg: colors.card, border: colors.border },
};

function Tag({ icon, text, tone, testID }: { icon: string; text: string; tone: DetailTone | ReviewTone; testID?: string }) {
  const t = TONE[tone];
  return (
    <View style={[s.tag, { backgroundColor: t.bg, borderColor: t.border }]} testID={testID}>
      <Ionicons name={icon as IconName} size={18} color={t.fg} importantForAccessibility="no" accessibilityElementsHidden />
      <Text style={[s.tagText, { color: tone === 'neutral' ? colors.text : t.fg }]}>{text}</Text>
    </View>
  );
}

function Assessment({ homeId, billId }: { homeId: string; billId: string }) {
  const q = useBillAssessment(homeId, billId, true);
  const state = detailScreenState({ isLoading: q.isLoading, error: q.error, hasData: !!q.data });
  if (state.kind === 'loading') return <LoadingSkeleton label="Revisando consistencia…" />;
  if (state.kind === 'unavailable')
    return <Text style={s.notice} testID="assessment-unavailable">La revisión de consistencia no está disponible en este servidor.</Text>;
  if (state.kind === 'error' || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} title="No se pudo revisar" />;
  const v = assessmentView(q.data);
  return (
    <View style={s.card} testID="assessment-result">
      <Text style={s.h2} accessibilityRole="header">Revisión de consistencia</Text>
      {q.isFetching ? <Text style={s.muted}>Actualizando…</Text> : null}
      <View style={s.approval} testID="assessment-approval-note">
        <Ionicons name="information-circle-outline" size={18} color={colors.text} importantForAccessibility="no" accessibilityElementsHidden />
        <Text style={s.approvalText}>{v.approvalNote}</Text>
      </View>
      <Tag icon={v.status.icon} text={v.status.label} tone={v.status.tone} testID="assessment-status" />
      <Text style={s.h3}>Comprobaciones</Text>
      {v.checks.length === 0 ? <Text style={s.muted}>Sin comprobaciones.</Text> : v.checks.map((c) => (
        <View key={c.key} style={s.check} testID={`assessment-check-${c.key}`}>
          <Ionicons name={c.icon as IconName} size={18} color={TONE[c.tone].fg} importantForAccessibility="no" accessibilityElementsHidden />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.rowTitle}>{c.title}: {c.statusText}</Text>
            {c.detail ? <Text style={s.muted}>{c.detail}</Text> : null}
          </View>
        </View>
      ))}
      {v.warnings.length > 0 ? (
        <View style={{ gap: 4 }} testID="assessment-warnings">
          <Text style={s.h3}>Advertencias</Text>
          {v.warnings.map((w) => (
            <View key={w} style={s.check}>
              <Ionicons name="warning" size={16} color={colors.warning} importantForAccessibility="no" accessibilityElementsHidden />
              <Text style={[s.body, { flex: 1 }]}>{w}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <Text style={s.h3}>Procedencia</Text>
      <Tag icon={v.provenance.icon} text={v.provenance.text} tone={v.provenance.tone} testID="assessment-provenance" />
      {v.provenance.detail ? <Text style={s.muted}>{v.provenance.detail}</Text> : null}
      <Text style={s.h3}>Correcciones</Text>
      {v.corrections.map((c) => (
        <View key={c.key} style={s.correction} testID={`assessment-correction-${c.key}`}>
          <Text style={s.rowTitle}>{c.title} · {c.dateText}</Text>
          {c.changes.length === 0 ? <Text style={s.muted}>Sin cambios en los campos mostrados.</Text> : c.changes.map((ch) => (
            <Text key={ch.field} style={s.body}>{ch.field}: antes {ch.before} → después {ch.after}</Text>
          ))}
        </View>
      ))}
      {v.correctionsNote ? <Text style={s.muted} testID="assessment-corrections-note">{v.correctionsNote}</Text> : null}
    </View>
  );
}

export function BillDetailScreen({ homeId: routeHomeId, billId, saved, onEdit }: { homeId: string; billId: string; saved?: boolean; onEdit: () => void }) {
  const selected = useSession((st) => st.selectedHomeId);
  const homeId = belongsToSelectedHome(selected, routeHomeId) ? routeHomeId : null;
  const bill = useBills(homeId).data?.find((b) => b.id === billId);
  const items = useBillItems(homeId, billId);
  // Cada toque vuelve a montar la revisión (staleTime 0 => relee el POST de solo lectura).
  const [round, setRound] = useState(0);

  if (!homeId) return <EmptyState icon="home-outline" title="Factura de otra vivienda" hint="Cambió la vivienda activa. Vuelva a Facturas para ver las de esta vivienda." testID="bill-detail-other-home" />;
  const state = detailScreenState({ isLoading: items.isLoading, error: items.error, hasData: !!items.data });
  const view = items.data ? detailView(items.data) : null;

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
      refreshControl={<RefreshControl refreshing={items.isRefetching} onRefresh={() => void items.refetch()} />}
      testID="bill-detail"
    >
      {bill ? <Text style={s.h1} accessibilityRole="header">Factura {fmtPeriod(bill.period_start, bill.period_end)}</Text> : null}
      {saved ? <Tag icon="checkmark-circle" text="Detalle guardado y confirmado." tone="success" testID="bill-detail-saved" /> : null}
      {state.kind === 'loading' ? <LoadingSkeleton label="Cargando detalle…" /> : null}
      {state.kind === 'unavailable' ? (
        <Text style={s.notice} testID="bill-detail-unavailable">El detalle de factura no está disponible en este servidor.</Text>
      ) : null}
      {state.kind === 'error' ? <ErrorState error={items.error} onRetry={() => void items.refetch()} /> : null}
      {view ? (
        <View style={s.card} testID="bill-detail-items">
          <Text style={s.h2} accessibilityRole="header">Cargos y descuentos</Text>
          {view.rows.length === 0 ? (
            <Text style={s.muted} testID="bill-detail-empty">Sin detalle de cargos y descuentos registrado.</Text>
          ) : view.rows.map((r) => (
            <View key={r.key} style={s.itemRow} testID={`bill-detail-${r.key}`}>
              <View style={{ flex: 1 }}>
                <Text style={s.body}>{r.label}</Text>
                <Text style={s.muted}>{r.kindLabel}</Text>
              </View>
              <Text style={s.amount}>{r.amountText}</Text>
            </View>
          ))}
          <View style={[s.itemRow, s.totalRow]}>
            <Text style={s.rowTitle}>Total de ítems</Text>
            <Text style={s.amount} testID="bill-detail-items-total">{view.totalText}</Text>
          </View>
          <View style={s.itemRow}>
            <Text style={s.rowTitle}>Total de la factura</Text>
            <Text style={s.amount} testID="bill-detail-bill-total">{view.billAmountText}</Text>
          </View>
          <Text style={s.h3}>Diferencia contra el total de la factura</Text>
          <Tag icon={view.difference.icon} text={view.difference.text} tone={view.difference.tone} testID="bill-detail-difference" />
          <Text style={s.muted}>El total de la factura no se recalcula a partir de los ítems.</Text>
        </View>
      ) : null}
      {state.canEdit ? <Button title="Editar ítems" onPress={onEdit} variant="secondary" testID="bill-detail-edit" /> : null}
      {state.canAssess ? (
        <Button title="Revisar consistencia" onPress={() => setRound((r) => r + 1)} testID="bill-detail-assess" />
      ) : null}
      {state.canAssess && round > 0 ? <Assessment key={round} homeId={homeId} billId={billId} /> : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  h1: { fontSize: 18, fontWeight: '700', color: colors.text },
  h2: { fontSize: 15, fontWeight: '700', color: colors.text },
  h3: { fontSize: 13, fontWeight: '700', color: colors.muted, marginTop: spacing.xs },
  body: { fontSize: 15, color: colors.text },
  rowTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  muted: { fontSize: 13, color: colors.muted },
  amount: { fontSize: 15, color: colors.text, fontVariant: ['tabular-nums'] },
  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, minHeight: 36 },
  totalRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  tag: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderWidth: 1, borderRadius: radius.sm, padding: spacing.sm },
  tagText: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  approval: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.noticeBg, borderColor: colors.noticeBorder, borderWidth: 1, borderRadius: radius.sm, padding: spacing.sm },
  approvalText: { fontSize: 14, fontWeight: '700', color: colors.text, flexShrink: 1 },
  check: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  correction: { gap: 2, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.xs },
  notice: { color: colors.text, backgroundColor: colors.noticeBg, borderColor: colors.noticeBorder, borderWidth: 1, padding: spacing.md, borderRadius: radius.sm },
});
