import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, radius, spacing, TOUCH } from '../theme';

export function Button({
  title,
  onPress,
  disabled,
  variant = 'primary',
  testID,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
  testID?: string;
  /** Nombre accesible cuando el texto visible no basta (p. ej. «Sacar» en una lista de personas). */
  accessibilityLabel?: string;
}) {
  const primary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!disabled }}
      testID={testID}
      style={({ pressed }) => [s.btn, !primary && s.btnSecondary, disabled && { opacity: 0.5 }, pressed && { opacity: 0.85 }]}
    >
      <Text style={[s.btnText, !primary && { color: colors.primary }]}>{title}</Text>
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
  },
  btnSecondary: { backgroundColor: 'transparent' },
  btnText: { color: colors.primaryText, fontWeight: '600', fontSize: 15 },
  textAction: { minHeight: TOUCH, justifyContent: 'center', paddingHorizontal: spacing.xs },
  textActionLabel: { fontWeight: '600', fontSize: 14 },
});
