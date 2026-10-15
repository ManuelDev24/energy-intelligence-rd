// Primitivas de UI del móvil. Este módulo mantiene las exportaciones históricas
// (Loading, ErrorView, EmptyView, QualityBadge, Button, TextAction) y reexporta los
// componentes del kit ERD-UI-KIT, que viven en archivos propios.
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../theme';

export { Button, TextAction } from './Button';
export { DataStatusBadge, QualityBadge } from './DataStatusBadge';
export { EmptyState, ErrorState, LoadingSkeleton, SkeletonBlock } from './states';
export { EmptyState as EmptyView, ErrorState as ErrorView } from './states';
export { MetricCard } from './MetricCard';
export { AlertCard } from './AlertCard';

/** Indicador de carga breve (p. ej. hidratación de la sesión). En pantallas con datos use LoadingSkeleton. */
export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <View style={s.center} accessibilityRole="progressbar" accessibilityLabel={label} testID="state-loading">
      <ActivityIndicator color={colors.primary} />
      <Text style={s.muted}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  muted: { color: colors.muted, textAlign: 'center', fontSize: 14 },
});
