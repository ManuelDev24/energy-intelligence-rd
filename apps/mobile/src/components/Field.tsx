import type { ComponentProps } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, spacing } from '../theme';

export function Field({
  label,
  error,
  testID,
  ...props
}: { label: string; error?: string; testID: string } & ComponentProps<typeof TextInput>) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        {...props}
        testID={testID}
        accessibilityLabel={label}
        style={[s.input, error ? s.inputErr : null]}
        placeholderTextColor={colors.muted}
      />
      {error ? (
        <Text style={s.err} testID={`${testID}-error`}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export const formStyles = StyleSheet.create({
  serverErr: { color: colors.danger, backgroundColor: colors.dangerBg, padding: spacing.md, borderRadius: 10 },
});

const s = StyleSheet.create({
  label: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  inputErr: { borderColor: colors.danger },
  err: { color: colors.danger, fontSize: 12 },
});
