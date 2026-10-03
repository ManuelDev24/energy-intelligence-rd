import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../api/client';
import type { Quality } from '../api/types';
import { colors, spacing } from '../theme';

export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <View style={s.center} accessibilityRole="progressbar" testID="state-loading">
      <ActivityIndicator color={colors.primary} />
      <Text style={s.muted}>{label}</Text>
    </View>
  );
}

export function ErrorView({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof ApiError || error instanceof Error ? error.message : 'Ocurrió un error inesperado';
  return (
    <View style={s.center} testID="state-error" accessibilityRole="alert">
      <Text style={s.errTitle}>No se pudo cargar</Text>
      <Text style={s.muted}>{msg}</Text>
      {onRetry && (
        <Pressable style={s.btn} onPress={onRetry} accessibilityRole="button" testID="retry">
          <Text style={s.btnText}>Reintentar</Text>
        </Pressable>
      )}
    </View>
  );
}

export function EmptyView({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <View style={s.center} testID="state-empty">
      <Text style={s.title}>{title}</Text>
      {hint ? <Text style={s.muted}>{hint}</Text> : null}
      {action}
    </View>
  );
}

const QUALITY_STYLE: Record<Quality, { fg: string; bg: string; label: string }> = {
  REAL: { fg: colors.real, bg: colors.realBg, label: 'REAL' },
  ESTIMATED: { fg: colors.estimated, bg: colors.estimatedBg, label: 'ESTIMADO' },
  PROJECTED: { fg: colors.projected, bg: colors.projectedBg, label: 'PROYECTADO' },
};

export function QualityBadge({ quality }: { quality: Quality }) {
  const q = QUALITY_STYLE[quality];
  return (
    <View style={[s.badge, { backgroundColor: q.bg }]} testID={`badge-${quality}`}>
      <Text style={[s.badgeText, { color: q.fg }]}>{q.label}</Text>
    </View>
  );
}

export function Button({
  title,
  onPress,
  disabled,
  variant = 'primary',
  testID,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
  testID?: string;
}) {
  const primary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      testID={testID}
      style={[s.btn, !primary && s.btnSecondary, disabled && { opacity: 0.5 }]}
    >
      <Text style={[s.btnText, !primary && { color: colors.primary }]}>{title}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  muted: { color: colors.muted, textAlign: 'center', fontSize: 14 },
  title: { color: colors.text, fontSize: 17, fontWeight: '600', textAlign: 'center' },
  errTitle: { color: colors.danger, fontSize: 17, fontWeight: '600' },
  btn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  btnSecondary: { backgroundColor: 'transparent' },
  btnText: { color: colors.primaryText, fontWeight: '600', fontSize: 15 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  badgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
});
