import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Home } from '../../api/types';
import { describeError } from '../../api/errors';
import { AUTH_ENABLED } from '../../config';
import { useAuth } from '../../auth/runtime';
import { Field, formStyles } from '../../components/Field';
import { KeyboardDoneBar, useKeyboardHeight } from '../../components/KeyboardDoneBar';
import { Button, EmptyView, ErrorView, Loading } from '../../components/ui';
import { useSession } from '../../store/session';
import { colors, spacing, TOUCH } from '../../theme';
import { EnergyProfileFields } from '../homes/EnergyProfileFields';
import { isEndpointUnavailable } from '../goals/model';
import { profileDraft, profilePatch, validateProfile, profileServerErrors, type ProfileDraft } from './model';
import { useProfileHome, useSaveHomeProfile } from './hooks';
import { useEditableDraft } from './useEditableDraft';

export function HomeProfileScreen() {
  const homeId = useSession(state => state.selectedHomeId);
  const { epoch } = useAuth();
  const query = useProfileHome(homeId);
  if (!homeId) return <EmptyView title="Seleccione una vivienda" />;
  if (query.isLoading) return <Loading label="Cargando mi vivienda…" />;
  if (query.isError) return isEndpointUnavailable(query.error)
    ? <EmptyView title="Mi vivienda no disponible" hint="Esta API no ofrece el perfil. Regrese a Inicio o actualice la API antes de editar." action={<Button title="Actualizar" onPress={() => void query.refetch()} />} />
    : <ErrorView error={query.error} onRetry={() => void query.refetch()} />;
  if (!query.data) return <EmptyView title="Sin datos de vivienda" />;
  return <HomeEditor key={`${epoch}:${homeId}`} home={query.data} />;
}
function HomeEditor({ home }: { home: Home }) {
  const editor = useEditableDraft(profileDraft(home));
  const draft = editor.state.value;
  const payload = profilePatch(draft, editor.state.baseline);
  const changed = Object.keys(payload).length > 0;
  const [errors, setErrors] = useState<ReturnType<typeof validateProfile>>({});
  const [message, setMessage] = useState<string | null>(null);
  const lock = useRef(false);
  const keyboardHeight = useKeyboardHeight();
  const mutation = useSaveHomeProfile(home.id);
  const disabled = mutation.isPending || !AUTH_ENABLED || isEndpointUnavailable(mutation.error);
  const set = <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) => { editor.set(key, value); setErrors(previous => ({ ...previous, [key]: undefined })); setMessage(null); };
  const field = (key: 'name' | 'province' | 'municipality' | 'sector' | 'userType' | 'occupants' | 'address' | 'city', label: string) => <Field label={label} testID={`profile-${key}`} value={draft[key]} onChangeText={value => set(key, value)} error={errors[key]} editable={!disabled} keyboardType={key === 'occupants' ? 'number-pad' : 'default'} />;
  const save = async () => {
    if (lock.current || disabled || !changed) return;
    const problems = validateProfile(draft); setErrors(problems);
    if (Object.keys(problems).length) return;
    lock.current = true; editor.begin(); setMessage(null);
    try { const canonical = await mutation.mutateAsync(payload); editor.confirm(profileDraft(canonical), editor.state); setMessage('Vivienda guardada y verificada.'); }
    catch (error) { setErrors(profileServerErrors(error)); }
    finally { editor.end(); lock.current = false; }
  };
  return <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Text style={s.title} accessibilityRole="header">Mi vivienda</Text>
      <Text style={s.hint}>Datos declarados, no mediciones. Los campos opcionales vacíos se guardan como Sin indicar.</Text>
      {!AUTH_ENABLED ? <Text style={s.hint}>Modo piloto: perfil de solo lectura.</Text> : null}
      {field('name', 'Nombre de la vivienda')}{field('province', 'Provincia (opcional)')}{field('municipality', 'Municipio (opcional)')}{field('sector', 'Sector (opcional)')}
      {field('address', 'Dirección (opcional)')}{field('city', 'Ciudad (opcional)')}
      <Text style={s.label}>Distribuidora</Text>
      <View style={s.options}>{(['EDESUR', 'EDENORTE', 'EDEESTE', 'Otra'] as const).map(value => <Pressable key={value} testID={`profile-distributor-${value}`} accessibilityRole="radio" accessibilityLabel={`Distribuidora: ${value}`} accessibilityState={{ checked: draft.distributor === value, disabled }} disabled={disabled} style={[s.option, draft.distributor === value && s.selected]} onPress={() => set('distributor', value)}><Text style={s.label}>{draft.distributor === value ? '✓ ' : ''}{value}</Text></Pressable>)}</View>
      {errors.distributor ? <Text accessibilityRole="alert" style={formStyles.serverErr}>{errors.distributor}</Text> : null}
      {field('userType', 'Tipo de usuario (opcional, texto libre)')}{field('occupants', 'Ocupantes (opcional, 1–999)')}
      <EnergyProfileFields draft={draft} onChange={set} disabled={disabled} prefix="profile" />
      {mutation.isError ? <Text testID="profile-home-error" accessibilityRole="alert" style={formStyles.serverErr}>{isEndpointUnavailable(mutation.error) ? 'Edición no disponible en esta API. Vuelva a Inicio.' : describeError(mutation.error).message}</Text> : null}
      <Text accessibilityLiveRegion="polite" style={s.label}>{message ?? ''}</Text>
      {AUTH_ENABLED ? <Button title={mutation.isPending ? 'Guardando…' : 'Guardar vivienda'} testID="profile-home-save" disabled={disabled || !changed} onPress={() => void save()} /> : null}
    </ScrollView>
    <KeyboardDoneBar keyboardHeight={keyboardHeight} />
  </KeyboardAvoidingView>;
}
const s = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.bg }, content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl }, title: { color: colors.text, fontSize: 24, fontWeight: '700' }, hint: { color: colors.muted, lineHeight: 22 }, label: { color: colors.text }, options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, option: { minHeight: TOUCH, padding: spacing.md, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, justifyContent: 'center' }, selected: { borderColor: colors.primary, borderWidth: 2 } });
