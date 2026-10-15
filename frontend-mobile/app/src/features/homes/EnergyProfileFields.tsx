import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, TOUCH } from '../../theme';
import type { OnboardingDraft } from './onboardingModel';

export const energyFlags = [
  ['hasAc', 'Aire acondicionado'], ['hasWaterHeater', 'Calentador de agua'],
  ['hasPool', 'Piscina'], ['hasSolar', 'Paneles solares'], ['hasInverter', 'Inversor'],
] as const;
export const triStateLabel = (value: boolean | null) => value === null ? 'Sin indicar' : value ? 'Sí' : 'No';
const choices = [null, true, false] as const;
export function EnergyProfileFields({ draft, onChange, disabled, prefix }: {
  draft: OnboardingDraft; onChange: (key: typeof energyFlags[number][0], value: boolean | null) => void;
  disabled: boolean; prefix: string;
}) {
  return <View style={s.list}>{energyFlags.map(([key, label]) => <View key={key} testID={`${prefix}-${key}`} style={s.list}>
    <Text style={s.label}>{label}</Text>
    <View style={s.options}>{choices.map((value) => <Pressable key={String(value)}
      testID={`${prefix}-${key}-${String(value)}`} accessibilityRole="radio"
      accessibilityLabel={`${label}: ${triStateLabel(value)}`} accessibilityState={{ checked: draft[key] === value, disabled }}
      disabled={disabled} onPress={() => onChange(key, value)}
      style={[s.option, draft[key] === value && s.selected]}>
      <Text style={s.label}>{draft[key] === value ? '✓ ' : ''}{triStateLabel(value)}</Text>
    </Pressable>)}</View>
  </View>)}</View>;
}
const s = StyleSheet.create({
  list: { gap: spacing.sm }, label: { color: colors.text },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: { minHeight: TOUCH, padding: spacing.md, justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.card },
  selected: { borderWidth: 2, borderColor: colors.primary },
});
