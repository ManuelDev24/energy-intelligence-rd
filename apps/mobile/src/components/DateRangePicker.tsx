import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MAX_RANGE_DAYS } from '@energyrd/core';
import { colors, radius, spacing, TOUCH } from '../theme';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { Field } from './Field';
import { applyRange, customRangeError } from './dateRangeModel';

export interface RangePresetOption<K extends string> { key: K; label: string }

/**
 * ERD-UI-KIT: atajos + «Personalizado» en una hoja inferior con dos fechas AAAA-MM-DD. Valida con las reglas de la API
 * (@energyrd/core) y que la fecha final no sea posterior a `today`. Controlado: el llamador guarda el rango.
 * No verificado en dispositivo.
 */
export function DateRangePicker<K extends string>({ presets, selected, from, to, today, onPreset, onCustom, testID = 'date-range' }: {
  presets: readonly RangePresetOption<K>[]; selected: K | 'custom'; from: string; to: string; today: string;
  onPreset: (preset: K) => void; onCustom: (range: { from: string; to: string }) => void; testID?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const [touched, setTouched] = useState(false);
  const error = touched ? customRangeError(draftFrom, draftTo, today) : null;
  const apply = () => {
    setTouched(true);
    if (customRangeError(draftFrom, draftTo, today)) return;
    onCustom(applyRange(draftFrom, draftTo));
    setOpen(false);
  };
  const chip = (active: boolean) => [s.chip, active && s.chipActive];
  return (
    <View testID={testID} accessibilityRole="radiogroup" style={s.row}>
      {presets.map((preset) => (
        <Pressable key={preset.key} testID={`${testID}-${preset.key}`} accessibilityRole="radio" accessibilityState={{ selected: selected === preset.key }}
          onPress={() => onPreset(preset.key)} style={chip(selected === preset.key)}>
          <Text style={[s.chipText, selected === preset.key && s.chipTextActive]}>{preset.label}</Text>
        </Pressable>
      ))}
      <Pressable testID={`${testID}-custom`} accessibilityRole="radio" accessibilityState={{ selected: selected === 'custom' }}
        accessibilityLabel={selected === 'custom' ? `Personalizado, del ${from} al ${to}` : 'Personalizado'}
        onPress={() => { setDraftFrom(from); setDraftTo(to); setTouched(false); setOpen(true); }} style={chip(selected === 'custom')}>
        <Text style={[s.chipText, selected === 'custom' && s.chipTextActive]}>Personalizado</Text>
      </Pressable>
      <BottomSheet visible={open} title="Rango personalizado" onClose={() => setOpen(false)} testID={`${testID}-sheet`}>
        <Text style={s.hint}>Máximo {MAX_RANGE_DAYS} días, ambos incluidos. Formato AAAA-MM-DD.</Text>
        <Field label="Desde" testID={`${testID}-from`} value={draftFrom} onChangeText={setDraftFrom} autoCapitalize="none" autoCorrect={false} keyboardType="numbers-and-punctuation" placeholder="2026-09-01" />
        <Field label="Hasta" testID={`${testID}-to`} value={draftTo} onChangeText={setDraftTo} autoCapitalize="none" autoCorrect={false} keyboardType="numbers-and-punctuation" placeholder="2026-09-30" error={error ?? undefined} onSubmitEditing={apply} />
        <Button title="Aplicar" testID={`${testID}-apply`} onPress={apply} />
      </BottomSheet>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { minHeight: TOUCH, paddingHorizontal: spacing.md, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.brandSoft },
  chipText: { color: colors.text, fontWeight: '600' },
  chipTextActive: { color: colors.primary },
  hint: { color: colors.muted, lineHeight: 20 },
});
