import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { colors, radius, spacing, TOUCH } from '../theme';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger';

export function Button({
  title,
  onPress,
  disabled,
  loading,
  variant = 'primary',
  testID,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  /** Ocupado: no admite más pulsaciones y se anuncia como «ocupado» al lector de pantalla. El texto lo decide quien llama. */
  loading?: boolean;
  variant?: ButtonVariant;
  testID?: string;
  /** Nombre accesible cuando el texto visible no basta (p. ej. «Sacar» en una lista de personas). */
  accessibilityLabel?: string;
}) {
  const inactive = !!disabled || !!loading;
  const solid = variant === 'primary' || variant === 'danger';
  const labelColor = solid ? colors.primaryText : colors.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: inactive, busy: !!loading }}
      testID={testID}
      style={({ pressed }) => [
        s.btn,
        variant === 'secondary' && s.btnSecondary,
        variant === 'tertiary' && s.btnTertiary,
        variant === 'danger' && s.btnDanger,
        inactive && { opacity: 0.5 },
        pressed && { opacity: 0.85 },
      ]}
    >
      {loading ? <ActivityIndicator color={labelColor} accessibilityElementsHidden importantForAccessibility="no" /> : null}
      <Text style={[s.btnText, { color: labelColor }]}>{title}</Text>
    </Pressable>
  );
}

/** Acción secundaria en texto, con área táctil de 44 pt (antes eran `Text` con onPress de ~20 pt). */
export function TextAction({
  title,
  onPress,
  tone = 'primary',
  testID,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  tone?: 'primary' | 'danger' | 'muted';
  testID?: string;
  accessibilityLabel?: string;
}) {
  const color = tone === 'danger' ? colors.danger : tone === 'muted' ? colors.muted : colors.primary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      testID={testID}
      hitSlop={8}
      style={({ pressed }) => [s.textAction, pressed && { opacity: 0.6 }]}
    >
      <Text style={[s.textActionLabel, { color }]}>{title}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  btn: {
    backgroundColor: colors.primary,
    minHeight: TOUCH,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    borderRadius: radius.sm,
    alignItems: 'center',
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  btnSecondary: { backgroundColor: 'transparent' },
  btnTertiary: { backgroundColor: 'transparent', borderColor: 'transparent' },
  btnDanger: { backgroundColor: colors.danger, borderColor: colors.danger },
  btnText: { fontWeight: '600', fontSize: 15 },
  textAction: { minHeight: TOUCH, justifyContent: 'center', paddingHorizontal: spacing.xs },
  textActionLabel: { fontWeight: '600', fontSize: 14 },
});
