import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';

import { ApiError } from '../../api/client';
import { useCreateReading, useReadings } from '../../api/hooks';
import { Field, formStyles } from '../../components/Field';
import { KeyboardDoneBar, useKeyboardHeight } from '../../components/KeyboardDoneBar';
import { Button, EmptyView } from '../../components/ui';
import { nowRD } from '../../lib/rdTime';
import { useSession } from '../../store/session';
import { colors, spacing } from '../../theme';
import { NOTE_MAX, READING_FIELD_MAP, lastReadingHint, readingErrorMessage, validateReading, type ReadingFormErrors, type ReadingFormValues } from './form';

export function ReadingFormScreen({ onDone }: { onDone: () => void }) {
  const homeId = useSession((st) => st.selectedHomeId);
  const create = useCreateReading(homeId ?? '');
  const readings = useReadings(homeId);
  const [v, setV] = useState<ReadingFormValues>(() => ({ ...nowRD(), kwh: '', note: '' }));
  const [errors, setErrors] = useState<ReadingFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const keyboardHeight = useKeyboardHeight();

  if (!homeId) return <EmptyView title="Seleccione una vivienda" hint="Elija una vivienda antes de registrar lecturas." />;

  const set = (k: keyof ReadingFormValues) => (t: string) => setV((prev) => ({ ...prev, [k]: t }));
  const hint = lastReadingHint(readings.data ?? []);

  const submit = () => {
    setServerError(null);
    const { errors: errs, input } = validateReading(v, readings.data ?? [], new Date());
    setErrors(errs);
    if (!input) return;
    create.mutate(input, {
      onSuccess: onDone,
      onError: (e) => {
        const fe: ReadingFormErrors = {};
        if (e instanceof ApiError)
          for (const [k, msg] of Object.entries(e.fieldErrors)) if (READING_FIELD_MAP[k]) fe[READING_FIELD_MAP[k]] = msg;
        setErrors(fe);
        setServerError(readingErrorMessage(e));
      },
    });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
        <Text style={s.intro}>Anote el número que marca el contador. Fecha y hora en hora de República Dominicana.</Text>
        <Field label="Fecha (AAAA-MM-DD)" testID="f-reading-date" value={v.date} onChangeText={set('date')} error={errors.date} placeholder="2026-10-04" autoCapitalize="none" autoCorrect={false} />
        <Field label="Hora (HH:MM, 24 h)" testID="f-reading-time" value={v.time} onChangeText={set('time')} error={errors.time} placeholder="08:30" autoCapitalize="none" autoCorrect={false} keyboardType="numbers-and-punctuation" />
        <Field label="Lectura del medidor (kWh)" testID="f-reading-kwh" value={v.kwh} onChangeText={set('kwh')} error={errors.kwh} keyboardType="decimal-pad" placeholder="12450.5" accessibilityHint={hint ?? undefined} />
        {hint ? (
          <Text style={s.hint} testID="reading-hint">
            {hint}
          </Text>
        ) : null}
        <Field label="Nota (opcional)" testID="f-reading-note" value={v.note} onChangeText={set('note')} error={errors.note} maxLength={NOTE_MAX} placeholder="Ej.: lectura de la mañana" />
        {serverError ? (
          <Text style={formStyles.serverErr} testID="reading-server-error" accessibilityRole="alert">
            {serverError}
          </Text>
        ) : null}
        <Button title={create.isPending ? 'Guardando…' : 'Guardar lectura'} onPress={submit} disabled={create.isPending} testID="save-reading" />
      </ScrollView>
      <KeyboardDoneBar keyboardHeight={keyboardHeight} />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  intro: { color: colors.muted, fontSize: 13 },
  hint: { color: colors.muted, fontSize: 12, marginTop: -spacing.xs },
});
