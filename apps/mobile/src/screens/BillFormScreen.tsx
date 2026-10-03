import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError } from '../api/client';
import { useCreateBill } from '../api/hooks';
import { Button, EmptyView } from '../components/ui';
import { inclusiveDays, validateBill, type BillFormErrors, type BillFormValues } from '../lib/billForm';
import { useSession } from '../store/session';
import { colors, spacing } from '../theme';

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
  const [v, setV] = useState<BillFormValues>(EMPTY);
  const [errors, setErrors] = useState<BillFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);

  if (!homeId) return <EmptyView title="Seleccione una vivienda" hint="Elija una vivienda antes de registrar facturas." />;

  const set = (k: keyof BillFormValues) => (t: string) => {
    setV((prev) => {
      const next = { ...prev, [k]: t };
      // Sugerir los días al completar ambas fechas, sin pisar un valor ya escrito a mano.
      if ((k === 'periodStart' || k === 'periodEnd') && !prev.days) {
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
          setServerError(e.message);
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
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: spacing.md, fontSize: 16, color: colors.text },
  inputErr: { borderColor: colors.danger },
  err: { color: colors.danger, fontSize: 12 },
  serverErr: { color: colors.danger, backgroundColor: colors.dangerBg, padding: spacing.md, borderRadius: 10 },
});
