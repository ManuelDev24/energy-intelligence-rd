// ERD-CLAIM-01-MOBILE: alta de una reclamación (misma validación que la API y la web, desde @energyrd/core).
import { CLAIM_KINDS, fmtPeriod, validateClaimForm, type ClaimFormErrors, type ClaimFormInput } from '@energyrd/core';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useBills, useClaimMutations } from '../../api/hooks';
import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { EmptyState } from '../../components/states';
import { useSession } from '../../store/session';
import { colors, radius, spacing, TOUCH } from '../../theme';
import { claimErrorText } from './model';

const EMPTY: ClaimFormInput = { kind: '', billId: '', subject: '', description: '', amount: '', reference: '' };

function Choice({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID: string }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ selected, checked: selected }} onPress={onPress} style={[s.choice, selected && s.choiceOn]} testID={testID}>
      <Text style={[s.choiceText, selected && { color: colors.brandDark, fontWeight: '700' }]}>{label}</Text>
    </Pressable>
  );
}

export function ClaimFormScreen({ onDone }: { onDone: (claimId: string) => void }) {
  const homeId = useSession((st) => st.selectedHomeId);
  const bills = useBills(homeId);
  const { create } = useClaimMutations(homeId ?? '');
  const [form, setForm] = useState<ClaimFormInput>(EMPTY);
  const [errors, setErrors] = useState<ClaimFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  if (!homeId) return <EmptyState icon="home-outline" title="Seleccione una vivienda" />;
  const needsBill = CLAIM_KINDS.find((k) => k.key === form.kind)?.needsBill ?? false;
  const set = <K extends keyof ClaimFormInput>(key: K, value: ClaimFormInput[K]) => { setForm((f) => ({ ...f, [key]: value })); setErrors((e) => ({ ...e, [key]: undefined })); };
  const submit = () => {
    setServerError(null);
    const result = validateClaimForm(form);
    if (!result.ok) { setErrors(result.errors); return; }
    create.mutate(result.value, { onSuccess: (claim) => onDone(claim.id), onError: (error) => setServerError(claimErrorText(error, 'create')) });
  };
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        {serverError ? <Text style={s.error} accessibilityRole="alert">{serverError}</Text> : null}
        <Text style={s.label} accessibilityRole="header">¿De qué se trata?</Text>
        <View accessibilityRole="radiogroup" style={{ gap: spacing.sm }}>
          {CLAIM_KINDS.map((k) => <Choice key={k.key} label={k.label} selected={form.kind === k.key} onPress={() => set('kind', k.key)} testID={`claim-kind-${k.key}`} />)}
        </View>
        {errors.kind ? <Text style={s.fieldError} accessibilityLiveRegion="polite">{errors.kind}</Text> : null}
        {needsBill ? (
          <View style={{ gap: spacing.sm }}>
            <Text style={s.label} accessibilityRole="header">Factura</Text>
            <View accessibilityRole="radiogroup" style={{ gap: spacing.sm }}>
              {(bills.data ?? []).map((b) => <Choice key={b.id} label={fmtPeriod(b.period_start, b.period_end)} selected={form.billId === b.id} onPress={() => set('billId', b.id)} testID={`claim-bill-${b.id}`} />)}
            </View>
            {bills.isLoading ? <Text style={s.muted}>Cargando facturas…</Text> : !bills.data?.length ? <Text style={s.muted}>No hay facturas registradas.</Text> : null}
            {errors.billId ? <Text style={s.fieldError} accessibilityLiveRegion="polite">{errors.billId}</Text> : null}
          </View>
        ) : null}
        <Field label="Asunto" testID="claim-subject" value={form.subject} maxLength={120} onChangeText={(t) => set('subject', t)} error={errors.subject} />
        <Field label="Qué pasó" testID="claim-description" value={form.description} maxLength={2000} multiline onChangeText={(t) => set('description', t)} error={errors.description} style={{ minHeight: 110, textAlignVertical: 'top' }} />
        <Field label="Monto en duda (RD$, opcional)" testID="claim-amount" value={form.amount} keyboardType="decimal-pad" onChangeText={(t) => set('amount', t)} error={errors.amount} />
        <Field label="Número de referencia de la distribuidora (opcional)" testID="claim-reference" value={form.reference} maxLength={60} onChangeText={(t) => set('reference', t)} error={errors.reference} />
        <Button title="Crear reclamación" onPress={submit} loading={create.isPending} testID="claim-submit" />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md },
  label: { color: colors.text, fontSize: 15, fontWeight: '700' },
  muted: { color: colors.muted, fontSize: 13 },
  error: { color: colors.danger, backgroundColor: colors.dangerBg, borderRadius: radius.sm, padding: spacing.sm, fontSize: 14 },
  fieldError: { color: colors.danger, fontSize: 13 },
  choice: { minHeight: TOUCH, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  choiceOn: { borderColor: colors.primary, backgroundColor: colors.brandSoft },
  choiceText: { color: colors.text, fontSize: 15 },
});
