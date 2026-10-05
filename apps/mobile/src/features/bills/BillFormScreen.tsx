import { suggestNextPeriod } from '@energyrd/core';
import { useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError } from '../../api/client';
import { describeError } from '../../api/errors';
import { useBills, useCreateBill } from '../../api/hooks';
import { Button, EmptyView } from '../../components/ui';
import { inclusiveDays, validateBill, type BillFormErrors, type BillFormValues } from '../../lib/billForm';
import { useSession } from '../../store/session';
import { colors, spacing } from '../../theme';

const EMPTY: BillFormValues = {
  periodStart: '',
  periodEnd: '',
  days: '',
  kwh: '',
  amount: '',
  readingPrevious: '',
  readingCurrent: '',
};

function Field({
  label,
  error,
  testID,
  ...props
}: { label: string; error?: string; testID: string } & React.ComponentProps<typeof TextInput>) {
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
      {error ? <Text style={s.err} testID={`${testID}-error`}>{error}</Text> : null}
    </View>
  );
}

export function BillFormScreen({ onDone }: { onDone: () => void }) {
  const homeId = useSession((st) => st.selectedHomeId);
  const create = useCreateBill(homeId ?? '');
  const bills = useBills(homeId);
  const [v, setV] = useState<BillFormValues>(EMPTY);
  const [touched, setTouched] = useState(false);
  const [daysManual, setDaysManual] = useState(false);
  const [errors, setErrors] = useState<BillFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const shown = Keyboard.addListener('keyboardWillShow', (event) => setKeyboardHeight(event.endCoordinates.height));
    const hidden = Keyboard.addListener('keyboardWillHide', () => setKeyboardHeight(0));
    return () => { shown.remove(); hidden.remove(); };
  }, []);

  // Período sugerido a partir de la última factura (ciclos seguidos); el usuario solo corrige si difiere.
  useEffect(() => {
    if (touched || !bills.data) return;
    const last = [...bills.data].sort((a, b) => b.period_end.localeCompare(a.period_end))[0];
    const next = suggestNextPeriod(last ?? null);
    setV((prev) => ({ ...prev, periodStart: next.period_start, periodEnd: next.period_end, days: String(next.days) }));
  }, [bills.data, touched]);

  if (!homeId) return <EmptyView title="Seleccione una vivienda" hint="Elija una vivienda antes de registrar facturas." />;

  const set = (k: keyof BillFormValues) => (t: string) => {
    setTouched(true);
    if (k === 'days') setDaysManual(t.trim() !== '');
    setV((prev) => {
      const next = { ...prev, [k]: t };
      // Recalcular los días al cambiar las fechas, salvo que el usuario los haya escrito a mano.
      if ((k === 'periodStart' || k === 'periodEnd') && !daysManual) {
        const d = inclusiveDays(next.periodStart, next.periodEnd);
        if (d !== null) next.days = String(d);
      }
      return next;
    });
  };

  const submit = () => {
    setServerError(null);
    const { errors: errs, input } = validateBill(v);
    setErrors(errs);
    if (!input) return;
    create.mutate(input, {
      onSuccess: onDone,
      onError: (e) => {
        if (e instanceof ApiError) {
          const fe: BillFormErrors = {};
          const map: Record<string, keyof BillFormValues> = {
            period_start: 'periodStart', period_end: 'periodEnd', kwh: 'kwh', amount_dop: 'amount',
            days: 'days', reading_previous: 'readingPrevious', reading_current: 'readingCurrent',
          };
          for (const [k, msg] of Object.entries(e.fieldErrors)) if (map[k]) fe[map[k]] = msg;
          setErrors(fe);
          setServerError(describeError(e).message);
        } else setServerError('Ocurrió un error inesperado');
      },
    });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
        <Field label="Inicio del período (AAAA-MM-DD)" testID="f-start" value={v.periodStart} onChangeText={set('periodStart')} error={errors.periodStart} placeholder="2026-09-01" autoCapitalize="none" />
        <Field label="Fin del período (AAAA-MM-DD)" testID="f-end" value={v.periodEnd} onChangeText={set('periodEnd')} error={errors.periodEnd} placeholder="2026-09-30" autoCapitalize="none" />
        <Field label="Días" testID="f-days" value={v.days} onChangeText={set('days')} error={errors.days} keyboardType="numeric" />
        <Field label="Consumo (kWh)" testID="f-kwh" value={v.kwh} onChangeText={set('kwh')} error={errors.kwh} keyboardType="decimal-pad" />
        <Field label="Monto total (RD$)" testID="f-amount" value={v.amount} onChangeText={set('amount')} error={errors.amount} keyboardType="decimal-pad" />
        <Field label="Lectura anterior (opcional)" testID="f-rprev" value={v.readingPrevious} onChangeText={set('readingPrevious')} error={errors.readingPrevious} keyboardType="decimal-pad" />
        <Field label="Lectura actual (opcional)" testID="f-rcurr" value={v.readingCurrent} onChangeText={set('readingCurrent')} error={errors.readingCurrent} keyboardType="decimal-pad" />
        {serverError ? (
          <Text style={s.serverErr} testID="server-error" accessibilityRole="alert">
            {serverError}
          </Text>
        ) : null}
        <Button title={create.isPending ? 'Guardando…' : 'Guardar factura'} onPress={submit} disabled={create.isPending} testID="save-bill" />
      </ScrollView>
      {keyboardHeight > 0 ? (
        <View style={[s.keyboardToolbar, { bottom: keyboardHeight }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cerrar teclado"
            testID="keyboard-done"
            onPress={() => Keyboard.dismiss()}
            style={s.keyboardDone}
          >
            <Text style={s.keyboardDoneText}>Listo</Text>
          </Pressable>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  keyboardToolbar: { position: 'absolute', left: 0, right: 0, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border, alignItems: 'flex-end', paddingHorizontal: spacing.lg },
  keyboardDone: { minHeight: 44, minWidth: 64, justifyContent: 'center', alignItems: 'center' },
  keyboardDoneText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
  label: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: spacing.md, fontSize: 16, color: colors.text },
  inputErr: { borderColor: colors.danger },
  err: { color: colors.danger, fontSize: 12 },
  serverErr: { color: colors.danger, backgroundColor: colors.dangerBg, padding: spacing.md, borderRadius: 10 },
});
