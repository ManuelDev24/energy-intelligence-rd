import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, TOUCH } from '../theme';

/** Casilla accesible (checkbox real, no decorativo) para consentimientos explícitos. */
export function Checkbox({
  label,
  checked,
  onChange,
  testID,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  testID: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: !!disabled }}
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => [s.row, disabled && { opacity: 0.5 }, pressed && { opacity: 0.85 }]}
    >
      <View style={[s.box, checked && s.boxChecked]}>{checked ? <Text style={s.mark}>✓</Text> : null}</View>
      <Text style={s.label}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, minHeight: TOUCH, paddingVertical: spacing.xs },
  box: {
    width: 22, height: 22, borderRadius: radius.sm, borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  boxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  mark: { color: colors.primaryText, fontSize: 14, fontWeight: '700' },
  label: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 20 },
});
