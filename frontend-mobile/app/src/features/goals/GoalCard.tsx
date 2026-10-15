import type { GoalProgress } from '@energyrd/api-contracts';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { UseQueryResult } from '@tanstack/react-query';
import { StyleSheet, Text, View } from 'react-native';

import { describeError } from '../../api/errors';
import { DataStatusBadge, QualityBadge } from '../../components/DataStatusBadge';
import { SkeletonBlock } from '../../components/states';
import { Button, TextAction } from '../../components/ui';
import { colors, radius, spacing } from '../../theme';
import { goalCardModel, isEndpointUnavailable, type GoalMetricView, type GoalTone } from './model';

type IconName = keyof typeof Ionicons.glyphMap;
const TONE: Record<GoalTone, { fg: string; bg: string; border: string }> = {
  success: { fg: colors.success, bg: colors.successBg, border: colors.successBorder },
  warning: { fg: colors.warning, bg: colors.warningBg, border: colors.warningBorder },
  danger: { fg: colors.danger, bg: colors.dangerBg, border: colors.dangerBorder },
  neutral: { fg: colors.muted, bg: colors.bg, border: colors.border },
};

/** Estado: icono + texto + color (nunca solo color). */
function StatusChip({ label, icon, tone, testID }: { label: string; icon: string; tone: GoalTone; testID: string }) {
  const t = TONE[tone];
  return (
    <View style={[s.chip, { backgroundColor: t.bg, borderColor: t.border }]} testID={testID} accessible accessibilityLabel={`Estado: ${label}`}>
      <Ionicons name={icon as IconName} size={14} color={t.fg} importantForAccessibility="no" />
      <Text style={[s.chipText, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

function MetricBlock({ m }: { m: GoalMetricView }) {
  const t = TONE[m.status.tone];
  return (
    <View style={s.metric} testID={`goal-${m.key}`}>
      <View style={s.row}>
        <Text style={s.metricTitle}>{m.title}</Text>
        <StatusChip label={m.status.label} icon={m.status.icon} tone={m.status.tone} testID={`goal-${m.key}-status`} />
      </View>
      <View style={[s.row, { justifyContent: 'flex-start', gap: 6, flexWrap: 'wrap' }]} accessible accessibilityLabel={m.a11y}>
        <Text style={s.value}>{m.soFar ?? 'Sin dato'}</Text>
        <Text style={s.muted}>de {m.target}</Text>
        {m.percentText ? <Text style={s.muted}>· {m.percentText}</Text> : null}
      </View>
      {m.soFarQuality ? <QualityBadge quality={m.soFarQuality} /> : null}
      {m.fraction !== null ? (
        <View style={s.track} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <View style={[s.fill, { width: `${Math.round(m.fraction * 100)}%`, backgroundColor: t.fg }]} />
        </View>
      ) : null}
      {m.projected ? (
        <View style={[s.row, { gap: 6 }]}>
          <Text style={s.label}>Proyección al cierre</Text>
          <View style={[s.row, { gap: 6 }]}>
            <Text style={s.valueSm}>{m.projected}</Text>
            <DataStatusBadge quality="PROJECTED" testID={`goal-${m.key}-projected`} />
          </View>
        </View>
      ) : null}
      {m.note ? (
        <View style={[s.row, { justifyContent: 'flex-start', gap: 6, flexWrap: 'wrap' }]} testID={`goal-${m.key}-source`}>
          <Text style={s.note}>{m.note.text}</Text>
          <DataStatusBadge quality={m.note.quality} testID={`goal-${m.key}-source-quality`} />
        </View>
      ) : null}
      {m.reasons.map((r) => (
        <Text key={r} style={s.note}>
          • {r}
        </Text>
      ))}
    </View>
  );
}

/**
 * Tarjeta de meta mensual del dashboard (ERD-GOAL-01). Falla en suave: con la API piloto (404) o un
 * error, muestra un aviso compacto y el resto del dashboard sigue igual.
 */
export function GoalCard({
  query,
  onEdit,
  onAddReading,
  onAddBill,
}: {
  query: UseQueryResult<GoalProgress, unknown>;
  onEdit?: () => void;
  onAddReading?: () => void;
  onAddBill?: () => void;
}) {
  if (query.isLoading)
    return (
      <View style={s.card} testID="goal-card-loading" accessible accessibilityRole="progressbar" accessibilityLabel="Cargando la meta mensual…">
        <SkeletonBlock height={14} width="40%" />
        <SkeletonBlock height={18} width="70%" />
      </View>
    );
  if (query.isError && isEndpointUnavailable(query.error))
    return (
      <View style={[s.card, s.compact]} testID="goal-card-unavailable">
        <Ionicons name="flag-outline" size={16} color={colors.muted} importantForAccessibility="no" />
        <Text style={[s.muted, { flex: 1 }]}>Metas mensuales no disponibles en este servidor.</Text>
      </View>
    );
  if (query.isError)
    return (
      <View style={[s.card, s.compact]} testID="goal-card-error">
        <Ionicons name="alert-circle-outline" size={16} color={colors.danger} importantForAccessibility="no" />
        <Text style={[s.muted, { flex: 1 }]}>No se pudo cargar la meta. {describeError(query.error).message}</Text>
        <TextAction title="Reintentar" onPress={() => void query.refetch()} testID="goal-retry" />
      </View>
    );
  if (!query.data) return null;

  const model = goalCardModel(query.data);
  if (model.kind === 'no_goal')
    return (
      <View style={s.card} testID="goal-card">
        <Text style={s.title} accessibilityRole="header">
          Meta mensual
        </Text>
        <Text style={s.muted}>Defina cuánto quiere gastar (RD$) o consumir (kWh) este mes y vea si va en camino.</Text>
        {onEdit ? <Button title="Definir meta" onPress={onEdit} testID="goal-set" /> : null}
      </View>
    );

  return (
    <View style={s.card} testID="goal-card">
      <View style={s.row}>
        <Text style={s.title} accessibilityRole="header">
          Meta de {model.month}
        </Text>
        <StatusChip label={model.status.label} icon={model.status.icon} tone={model.status.tone} testID={`goal-status-${query.data.status}`} />
      </View>
      <Text style={s.muted}>{model.status.description}</Text>
      {model.metrics.map((m) => (
        <MetricBlock key={m.key} m={m} />
      ))}
      {model.ctas.length > 0 ? (
        <View style={s.ctas}>
          {model.ctas.includes('add_reading') && onAddReading ? (
            <View style={{ flex: 1 }}>
              <Button title="Registrar lectura" onPress={onAddReading} testID="goal-add-reading" />
            </View>
          ) : null}
          {model.ctas.includes('add_bill') && onAddBill ? (
            <View style={{ flex: 1 }}>
              <Button title="Agregar factura" variant="secondary" onPress={onAddBill} testID="goal-add-bill" />
            </View>
          ) : null}
        </View>
      ) : null}
      {onEdit ? (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          <TextAction title="Editar meta" onPress={onEdit} testID="goal-edit" />
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  compact: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  title: { fontSize: 14, fontWeight: '700', color: colors.text, flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full, borderWidth: 1 },
  chipText: { fontSize: 12, fontWeight: '700' },
  metric: { gap: 6, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  metricTitle: { fontSize: 13, fontWeight: '600', color: colors.muted },
  value: { color: colors.text, fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  valueSm: { color: colors.text, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  label: { color: colors.muted, fontSize: 14 },
  muted: { color: colors.muted, fontSize: 13 },
  note: { color: colors.muted, fontSize: 12 },
  track: { height: 8, borderRadius: radius.full, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: 8, borderRadius: radius.full },
  ctas: { flexDirection: 'row', gap: spacing.sm },
});
