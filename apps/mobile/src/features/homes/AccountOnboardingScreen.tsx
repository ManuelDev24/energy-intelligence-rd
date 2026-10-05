import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { Home } from '../../api/types';
import { api, ApiError } from '../../api/client';
import { createOnboardingApi } from '../../api/onboarding';
import { keys } from '../../api/hooks';
import { describeError } from '../../api/errors';
import { authSession } from '../../auth/runtime';
import { Field, formStyles } from '../../components/Field';
import { Button } from '../../components/ui';
import { KeyboardDoneBar, useKeyboardHeight } from '../../components/KeyboardDoneBar';
import { API_URL } from '../../config';
import { createAuthenticatedFetch } from '../../auth/transport';
import { useSession } from '../../store/session';
import { colors, spacing, TOUCH } from '../../theme';
import { initialOnboardingDraft, onboardingTitles, validateOnboardingStep, type OnboardingDraft, type OnboardingErrors } from './onboardingModel';
import { saveOnboarding } from './saveOnboarding';
import { EnergyProfileFields, energyFlags as flags, triStateLabel } from './EnergyProfileFields';

const transport = createAuthenticatedFetch(authSession);
const onboardingApi = createOnboardingApi(API_URL, transport);
const distributors = ['EDESUR', 'EDENORTE', 'EDEESTE', 'Otra'] as const;


export function AccountOnboardingScreen({ onDone, onCancel }: { onDone: (home: Home) => void; onCancel?: () => void }) {
  const [draft, setDraft] = useState(initialOnboardingDraft);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<OnboardingErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [homeId, setHomeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const createdId = useRef<string | null>(null);
  const [creationUncertain, setCreationUncertain] = useState(false);
  const qc = useQueryClient();
  const keyboardHeight = useKeyboardHeight();
  const set = <K extends keyof OnboardingDraft>(key: K, value: OnboardingDraft[K]) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: undefined }));
  };
  const field = (key: 'name' | 'province' | 'municipality' | 'sector' | 'accountNumber' | 'userType' | 'occupants' | 'goalAmount' | 'goalKwh', label: string, keyboardType?: 'number-pad' | 'decimal-pad') => (
    <Field label={label} testID={`account-onboarding-${key}`} value={draft[key]} onChangeText={(value) => set(key, value)} error={errors[key]} keyboardType={keyboardType} editable={!busy && !(homeId && ['accountNumber', 'goalAmount', 'goalKwh'].includes(key))} />
  );
  const next = () => {
    const problems = validateOnboardingStep(step, draft);
    setErrors(problems);
    if (Object.keys(problems).length === 0) setStep(step + 1);
  };
  const submit = async () => {
    if (inFlight.current || creationUncertain) return;
    for (let i = 0; i < onboardingTitles.length - 1; i++) {
      const problems = validateOnboardingStep(i, draft);
      if (Object.keys(problems).length) { setErrors(problems); setStep(i); return; }
    }
    inFlight.current = true;
    setBusy(true); setServerError(null);
    const epoch = authSession.getSnapshot().epoch;
    try {
      const id = await saveOnboarding(draft, onboardingApi, { homeId, checkSession: () => authSession.checkEpoch(epoch), onCreated: (id) => { createdId.current = id; setHomeId(id); } });
      authSession.checkEpoch(epoch);
      // Re-fetch canonical server representation (all profile fields) before selecting it.
      const homes = await qc.fetchQuery({ queryKey: keys.homes, queryFn: () => api.listHomes(), staleTime: 0 });
      authSession.checkEpoch(epoch);
      const home = homes.find((item) => item.id === id);
      if (!home) throw new Error('La vivienda creada no aparece en su cuenta. Actualice e intente de nuevo.');
      useSession.getState().selectHome(id);
      useSession.getState().completeOnboarding();
      onDone(home);
    } catch (error) {
      if (!createdId.current && (!(error instanceof ApiError) || error.status === 0 || error.status >= 500)) setCreationUncertain(true);
      setServerError(describeError(error).message);
      if (authSession.getSnapshot().epoch === epoch) void qc.invalidateQueries({ queryKey: keys.homes });
    } finally { inFlight.current = false; setBusy(false); }
  };
  return <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Text style={s.progress}>Paso {step + 1} de {onboardingTitles.length}</Text>
      <Text style={s.title} accessibilityRole="header">{onboardingTitles[step]}</Text>
      {step === 0 ? <>
        <Text style={s.hint}>Indique dónde se encuentra su vivienda. No se solicita dirección exacta.</Text>
        {field('name', 'Nombre de la vivienda')}{field('province', 'Provincia')}{field('municipality', 'Municipio')}{field('sector', 'Sector (opcional)')}
      </> : null}
      {step === 1 ? <>
        <Text style={s.hint}>Seleccione su distribuidora. El número de contrato es opcional y puede agregarse luego.</Text>
        <View style={s.options}>{distributors.map((value) => <Pressable key={value} testID={`account-onboarding-distributor-${value}`} accessibilityRole="radio" accessibilityState={{ checked: draft.distributor === value }} disabled={busy} style={[s.option, draft.distributor === value && s.selected]} onPress={() => set('distributor', value)}><Text style={s.optionText}>{draft.distributor === value ? '✓ ' : ''}{value}</Text></Pressable>)}</View>
        {field('accountNumber', 'Número de contrato o cuenta (opcional)')}
      </> : null}
      {step === 2 ? <>
        <Text style={s.hint}>Describa su tipo de usuario en sus propias palabras. No asignamos una categoría tarifaria o regulatoria.</Text>
        {field('userType', 'Tipo de usuario')}
      </> : null}
      {step === 3 ? <>
        {field('occupants', 'Cantidad de ocupantes (opcional)', 'number-pad')}
        <Text style={s.hint}>Indique qué equipos tiene en casa. Esto no mide consumo automáticamente.</Text>
        <EnergyProfileFields draft={draft} onChange={set} disabled={busy} prefix="account-onboarding" />
      </> : null}
      {step === 4 ? <>
        <Text style={s.hint}>Puede definir una meta mensual en RD$ o kWh, ambas o ninguna. No representa consumo medido.</Text>
        {field('goalAmount', 'Meta mensual (RD$)', 'decimal-pad')}{field('goalKwh', 'Meta mensual (kWh)', 'decimal-pad')}
      </> : null}
      {step === 5 ? <>
        <Text style={s.hint}>Revise sus datos antes de guardar. Podrá regresar para corregirlos.</Text>
        <Text style={s.summary}>Vivienda: {draft.name.trim()} · {draft.province.trim()}, {draft.municipality.trim()}{draft.sector.trim() ? `, ${draft.sector.trim()}` : ''}</Text>
        <Text style={s.summary}>Distribuidora: {draft.distributor} · Cuenta: {draft.accountNumber.trim() || 'No indicada'}</Text>
        <Text style={s.summary}>Tipo: {draft.userType.trim()} · Ocupantes: {draft.occupants.trim() || 'No indicados'}</Text>
        {flags.map(([key, label]) => <Text key={key} style={s.summary}>{label}: {triStateLabel(draft[key])}</Text>)}
        <Text style={s.summary}>Meta mensual: {draft.goalAmount.trim() ? `RD$ ${draft.goalAmount.trim()}` : ''}{draft.goalKwh.trim() ? ` · ${draft.goalKwh.trim()} kWh` : ''}{!draft.goalAmount.trim() && !draft.goalKwh.trim() ? 'No indicada' : ''}</Text>
      </> : null}
      {serverError ? <Text testID="account-onboarding-error" accessibilityRole="alert" style={formStyles.serverErr}>{serverError}{homeId ? ' La vivienda ya fue creada; puede reintentar guardar los datos pendientes sin duplicarla.' : ''}</Text> : null}
      <Button title={busy ? 'Guardando…' : step === 5 ? 'Guardar y comenzar' : 'Continuar'} testID="account-onboarding-next" disabled={busy || creationUncertain} onPress={() => { if (step === 5) void submit(); else next(); }} />
      {homeId ? <Text style={s.hint}>Contrato y meta quedan fijados durante este reintento para no ocultar datos ya guardados. Puede editarlos después en Mi servicio y Meta mensual.</Text> : null}
      {creationUncertain ? <Text accessibilityRole="alert" style={s.hint}>No se pudo confirmar la creación. Vuelva a Mis viviendas y actualice antes de crear otra; la API no permite confirmar automáticamente una escritura sin respuesta.</Text> : null}
      {step > 0 ? <Button title="Atrás" variant="secondary" disabled={busy} onPress={() => { setStep(step - 1); setServerError(null); }} /> : null}
      {onCancel ? <Button title="Volver a mis viviendas" variant="secondary" disabled={busy} onPress={onCancel} /> : null}
    </ScrollView>
    <KeyboardDoneBar keyboardHeight={keyboardHeight} />
  </KeyboardAvoidingView>;
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg }, content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  progress: { color: colors.primary, fontWeight: '700' }, title: { fontSize: 24, fontWeight: '700', color: colors.text },
  hint: { color: colors.muted, lineHeight: 22 }, summary: { color: colors.text, fontSize: 16, lineHeight: 24 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: { minHeight: TOUCH, justifyContent: 'center', padding: spacing.md, borderWidth: 1, borderRadius: 8, borderColor: colors.border, backgroundColor: colors.card },
  selected: { borderColor: colors.primary, borderWidth: 2 }, optionText: { color: colors.text },
});
