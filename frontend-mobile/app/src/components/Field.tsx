import type { ComponentProps, ComponentRef, Ref } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, spacing, TOUCH } from '../theme';

export function Field({
  label,
  error,
  hint,
  testID,
  inputRef,
  ...props
}: { label: string; error?: string; hint?: string; testID: string; inputRef?: Ref<ComponentRef<typeof TextInput>> } & ComponentProps<typeof TextInput>) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        ref={inputRef}
        {...props}
        testID={testID}
        accessibilityLabel={error ? `${label}. ${error}` : label}
        accessibilityHint={error ? 'Revise este campo e intente de nuevo.' : props.accessibilityHint}
        style={[s.input, error ? s.inputErr : null]}
        placeholderTextColor={colors.muted}
      />
      {!error && hint ? <Text style={s.hint} testID={`${testID}-hint`}>{hint}</Text> : null}
      {error ? (
        <Text style={s.err} accessibilityLiveRegion="polite" testID={`${testID}-error`}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export const formStyles = StyleSheet.create({
  serverErr: { color: colors.danger, backgroundColor: colors.dangerBg, padding: spacing.md, borderRadius: 10 },
  groupLabel: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  groupErr: { fontSize: 12, color: colors.danger },
});

const s = StyleSheet.create({
  label: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: TOUCH,
    fontSize: 16,
    color: colors.text,
  },
  inputErr: { borderColor: colors.danger },
  err: { color: colors.danger, fontSize: 12 },
  hint: { color: colors.muted, fontSize: 12 },
});
