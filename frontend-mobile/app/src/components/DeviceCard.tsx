import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import type { Equipment, EquipmentEstimate } from '../api/types';
import { colors, chartColors, radius, spacing } from '../theme';
import { TextAction } from './Button';
import { QualityBadge } from './DataStatusBadge';
import { deviceCardView } from './deviceCardModel';

/**
 * ERD-DEV-02: equipo en una lista. Icono, nombre, tipo y habitación, marca y modelo, potencia y uso declarados y — si la
 * API ya estimó — kWh/mes y su porcentaje del total de los equipos (calculado en el servidor). Todo lo estimado lleva su
 * etiqueta ESTIMADO; la barra acompaña al texto, no lo sustituye. Un solo nombre accesible resume la tarjeta; las acciones
 * llevan el nombre del equipo.
 */
export function DeviceCard({
  item,
  estimate,
  onEdit,
  onDelete,
}: {
  item: Equipment;
  estimate?: EquipmentEstimate['items'][number];
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const v = deviceCardView(item, estimate);
  return (
    <View style={s.card} testID={`equipment-${item.name}`}>
      <View style={s.head} accessible accessibilityLabel={v.accessibilityLabel}>
        <View style={s.iconBox}>
          <Ionicons name={v.iconName as never} size={22} color={colors.brandDark} accessible={false} />
        </View>
        <View style={s.headText}>
          <Text style={s.title} numberOfLines={2}>
            {v.title}
          </Text>
          <Text style={s.meta}>{v.subtitle}</Text>
          {v.makeModel ? (
            <Text style={s.meta} testID="device-make-model">
              {v.makeModel}
            </Text>
          ) : null}
        </View>
        {estimate ? <QualityBadge quality={estimate.monthly_kwh.quality} /> : null}
      </View>
      <Text style={s.meta}>{v.usage}</Text>
      {v.monthly ? <Text style={s.value}>{v.monthly}</Text> : null}
      {v.share ? (
        <View style={s.shareRow} testID="device-share">
          <View style={s.track} accessible={false} importantForAccessibility="no-hide-descendants">
            <View style={[s.bar, { width: `${Math.max(2, v.share.ratio * 100)}%` }]} />
          </View>
          <Text style={s.shareText}>{v.share.label}</Text>
        </View>
      ) : null}
      {onEdit || onDelete ? (
        <View style={s.actions}>
          {onEdit ? <TextAction title="Editar" onPress={onEdit} accessibilityLabel={`Editar ${item.name}`} /> : null}
          {onDelete ? <TextAction title="Eliminar" tone="danger" onPress={onDelete} accessibilityLabel={`Eliminar ${item.name}`} /> : null}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: 6 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  iconBox: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  headText: { flex: 1, gap: 2 },
  title: { fontWeight: '700', color: colors.text, fontSize: 15 },
  meta: { color: colors.muted, fontSize: 13 },
  value: { color: colors.text, fontWeight: '600', fontSize: 14, fontVariant: ['tabular-nums'] },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  track: { flex: 1, height: 8, borderRadius: radius.full, backgroundColor: colors.estimatedBg, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: radius.full, backgroundColor: chartColors.estimated },
  shareText: { color: colors.text, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'], minWidth: 56, textAlign: 'right' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.md },
});
