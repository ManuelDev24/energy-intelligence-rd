import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { ApiError } from '../../api/client';
import { describeError } from '../../api/errors';
import { AUTH_ENABLED } from '../../config';
import { useAuth } from '../../auth/runtime';
import { Field, formStyles } from '../../components/Field';
import { KeyboardDoneBar, useKeyboardHeight } from '../../components/KeyboardDoneBar';
import { Button, EmptyView, ErrorView, Loading } from '../../components/ui';
import { useSession } from '../../store/session';
import { colors, spacing } from '../../theme';
import { isEndpointUnavailable } from '../goals/model';
import { useHomeContract, useProfileHome, useSaveHomeContract } from './hooks';
import { profileServerErrors } from './model';
import { useEditableDraft } from './useEditableDraft';

export function ServiceProfileScreen() {
  const homeId = useSession(state => state.selectedHomeId);
  const { epoch } = useAuth();
  const home = useProfileHome(homeId);
  const contract = useHomeContract(homeId);
  if (!homeId) return <EmptyView title="Seleccione una vivienda" />;
  if (home.isLoading || contract.isLoading) return <Loading label="Cargando mi servicio…" />;
  if (home.isError) return isEndpointUnavailable(home.error) ? <EmptyView title="Mi servicio no disponible" hint="No se puede verificar esta vivienda en la API. Regrese a Inicio." /> : <ErrorView error={home.error} onRetry={() => void home.refetch()} />;
  const missing = contract.error instanceof ApiError && contract.error.status === 404;
  if (contract.isError && !missing) return isEndpointUnavailable(contract.error) ? <EmptyView title="Mi servicio no disponible" hint="Esta API no ofrece contratos. Regrese a Inicio." /> : <ErrorView error={contract.error} onRetry={() => void contract.refetch()} />;
  if (!home.data) return <EmptyView title="Sin datos de servicio" />;
  return <ContractEditor key={`${epoch}:${homeId}`} homeId={homeId} distributor={home.data.distributor} number={contract.data?.account_number ?? ''} missing={missing} onRefresh={() => void contract.refetch()} />;
}
function ContractEditor({ homeId, distributor, number: initial, missing, onRefresh }: { homeId: string; distributor: string; number: string; missing: boolean; onRefresh: () => void }) {
  const editor = useEditableDraft({ number: initial });
  const number = editor.state.value.number;
  const changed = number.trim() !== editor.state.baseline.number.trim();
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);
  const lock = useRef(false);
  const keyboardHeight = useKeyboardHeight();
  const mutation = useSaveHomeContract(homeId);
  const disabled = mutation.isPending || !AUTH_ENABLED || isEndpointUnavailable(mutation.error);
  const save = async () => {
    if (disabled || lock.current || !changed) return;
    const value = number.trim();
    if (!value || Array.from(value).length > 120) { setFieldError('Ingrese un número de contrato de 1 a 120 caracteres.'); return; }
    lock.current = true; editor.begin(); setSaved(false); setFieldError(undefined);
    try { const contract = await mutation.mutateAsync(value); editor.confirm({ number: contract.account_number }, editor.state); setSaved(true); }
    catch (error) { setFieldError(profileServerErrors(error).accountNumber); }
    finally { editor.end(); lock.current = false; }
  };
  return <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Text style={s.title} accessibilityRole="header">Mi servicio</Text>
      <Text style={s.text}>Distribuidora: {distributor}</Text>
      <Text style={s.hint}>La distribuidora se modifica en Mi vivienda. El contrato es información declarada, no una conexión con la distribuidora ni una tarifa asignada.</Text>
      {missing && !saved ? <Text style={s.hint}>No hay contrato registrado o el servicio no está disponible en esta API. Puede intentar agregarlo; solo se confirmará después de guardarlo y volver a consultarlo.</Text> : null}
      {!AUTH_ENABLED ? <Text style={s.hint}>Modo piloto: servicio de solo lectura.</Text> : null}
      <Field label="Número de contrato o cuenta" testID="profile-account-number" value={number} error={fieldError} editable={!disabled} onChangeText={value => { editor.set('number', value); setFieldError(undefined); setSaved(false); }} />
      <Text style={s.hint}>No se puede eliminar un contrato: no existe una API de eliminación. Dejarlo vacío no borra datos.</Text>
      {mutation.isError ? <Text testID="profile-service-error" accessibilityRole="alert" style={formStyles.serverErr}>{isEndpointUnavailable(mutation.error) ? 'Servicio no disponible en esta API. Regrese a Inicio.' : describeError(mutation.error).message}</Text> : null}
      <Text accessibilityLiveRegion="polite" style={s.text}>{saved ? 'Contrato guardado y verificado.' : ''}</Text>
      {AUTH_ENABLED ? <Button title={mutation.isPending ? 'Guardando…' : 'Guardar contrato'} testID="profile-service-save" disabled={disabled || !changed} onPress={() => void save()} /> : null}
      <Button title="Consultar contrato de nuevo" variant="secondary" disabled={mutation.isPending} onPress={onRefresh} />
    </ScrollView>
    <KeyboardDoneBar keyboardHeight={keyboardHeight} />
  </KeyboardAvoidingView>;
}
const s = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.bg }, content: { padding: spacing.lg, gap: spacing.md }, title: { color: colors.text, fontSize: 24, fontWeight: '700' }, text: { color: colors.text }, hint: { color: colors.muted, lineHeight: 22 } });
