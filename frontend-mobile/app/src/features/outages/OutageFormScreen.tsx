import { OUTAGE_CAUSE_ORDER, OUTAGE_CAUSES, outageToForm, validateOutageForm, type OutageFormErrors, type OutageFormValues } from '@energyrd/core';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';

import { useCreateOutage, useOutages, useUpdateOutage } from '../../api/hooks';
import { ChoiceGrid } from '../../components/ChoiceGrid';
import { Checkbox } from '../../components/Checkbox';
import { Field, formStyles } from '../../components/Field';
import { KeyboardDoneBar, useKeyboardHeight } from '../../components/KeyboardDoneBar';
import { Button, EmptyView } from '../../components/ui';
import { nowRD } from '../../lib/rdTime';
import { useSession } from '../../store/session';
import { colors, spacing } from '../../theme';
import { NOTE_MAX } from '../readings/form';
import { outageErrorMessage } from './outagesModel';

export function OutageFormScreen({ outageId, onDone }: { outageId?: string; onDone: () => void }) {
  const homeId = useSession((st) => st.selectedHomeId);
  const create = useCreateOutage(homeId ?? '');
  const update = useUpdateOutage(homeId ?? '');
  const existing = useOutages(homeId).data?.find((o) => o.id === outageId);
  const [v, setV] = useState<OutageFormValues>(() => {
    if (existing) return outageToForm(existing);
    const now = nowRD();
    return { startDate: now.date, startTime: now.time, ongoing: false, endDate: now.date, endTime: now.time, cause: 'unknown', note: '' };
  });
  const [errors, setErrors] = useState<OutageFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const keyboardHeight = useKeyboardHeight();

  if (!homeId) return <EmptyView title="Seleccione una vivienda" hint="Elija una vivienda antes de registrar apagones." />;
  if (outageId && !existing) return <EmptyView title="Apagón no encontrado" hint="Ya no existe o todavía se está cargando." />;

  const set = <K extends keyof OutageFormValues>(k: K) => (value: OutageFormValues[K]) => setV((prev) => ({ ...prev, [k]: value }));
  const pending = create.isPending || update.isPending;

  const submit = () => {
    setServerError(null);
    const result = validateOutageForm(v);
    if (!result.ok) { setErrors(result.errors); return; }
    setErrors({});
    const opts = { onSuccess: onDone, onError: (e: unknown) => setServerError(outageErrorMessage(e)) };
    if (existing) update.mutate({ id: existing.id, input: result.value }, opts);
    else create.mutate(result.value, opts);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
        <Text style={s.intro}>Fechas y horas en hora de República Dominicana. El apagón no puede estar en el futuro, solaparse con otro ni durar más de 30 días.</Text>
        <Field label="Día en que se fue la luz (AAAA-MM-DD)" testID="f-outage-start-date" value={v.startDate} onChangeText={set('startDate')} error={errors.startDate} placeholder="2026-10-04" autoCapitalize="none" autoCorrect={false} />
        <Field label="Hora en que se fue (HH:MM, 24 h)" testID="f-outage-start-time" value={v.startTime} onChangeText={set('startTime')} error={errors.startTime} placeholder="14:30" autoCapitalize="none" autoCorrect={false} keyboardType="numbers-and-punctuation" />
        <Checkbox label="Todavía sin luz" checked={v.ongoing} onChange={set('ongoing')} testID="f-outage-ongoing" />
        {!v.ongoing ? (
          <>
            <Field label="Día en que volvió (AAAA-MM-DD)" testID="f-outage-end-date" value={v.endDate} onChangeText={set('endDate')} error={errors.endDate} placeholder="2026-10-04" autoCapitalize="none" autoCorrect={false} />
            <Field label="Hora en que volvió (HH:MM, 24 h)" testID="f-outage-end-time" value={v.endTime} onChangeText={set('endTime')} error={errors.endTime} placeholder="16:00" autoCapitalize="none" autoCorrect={false} keyboardType="numbers-and-punctuation" />
          </>
        ) : null}
        <Text style={s.label} accessibilityRole="header">Causa</Text>
        <ChoiceGrid
          label="Causa del apagón"
          options={OUTAGE_CAUSE_ORDER.map((c) => ({ key: c, label: OUTAGE_CAUSES[c] }))}
          value={v.cause}
          onChange={set('cause')}
          testIDPrefix="outage-cause"
        />
        <Field label="Nota (opcional)" testID="f-outage-note" value={v.note} onChangeText={set('note')} error={errors.note} maxLength={NOTE_MAX} placeholder="Ej.: se fue con la lluvia" />
        {serverError ? <Text style={formStyles.serverErr} testID="outage-server-error" accessibilityRole="alert">{serverError}</Text> : null}
        <Button title={pending ? 'Guardando…' : existing ? 'Guardar cambios' : 'Guardar apagón'} onPress={submit} disabled={pending} testID="save-outage" />
      </ScrollView>
      <KeyboardDoneBar keyboardHeight={keyboardHeight} />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  intro: { color: colors.muted, fontSize: 13 },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
});
