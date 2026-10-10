import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { api } from '../../api/client';
import { describeError } from '../../api/errors';
import { authSession } from '../../auth/runtime';
import { Field, formStyles } from '../../components/Field';
import { Button, ErrorView, Loading } from '../../components/ui';
import { colors, spacing } from '../../theme';
import { useProfileScope } from './hooks';
import {
  PASSWORD_CHANGED_MESSAGE, SESSION_LOST_MESSAGE, canSubmitPassword, emptyPasswordDraft, formatSessionDate, preferencesChanged,
  validatePasswordDraft, type PasswordDraft,
} from './accountSettings';

/**
 * ERD-PROF-01: ajustes de la cuenta — cambiar contraseña, avisos y sesiones activas. Sin ajustes inventados: idioma y
 * unidades no existen (solo español, kWh y RD$), y los avisos solo se guardan hasta que existan los envíos (ERD-ALERT-02).
 * No verificado en dispositivo (ver docs/qa/ERD-PROF-01.md).
 */
export function AccountSettingsScreen() {
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <PasswordSection />
      <NotificationsSection />
      <SessionsSection />
    </ScrollView>
  );
}

function PasswordSection() {
  const [draft, setDraft] = useState<PasswordDraft>(emptyPasswordDraft);
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState(false);
  const mutation = useMutation({
    retry: false,
    mutationFn: async (value: PasswordDraft) => {
      const pair = await api.changePassword(value.current, value.next);
      try { await authSession.replaceTokens(pair); }
      catch {
        // La API ya cerró TODAS las sesiones, también ésta: sin el par nuevo no hay sesión que conservar.
        await authSession.invalidate(SESSION_LOST_MESSAGE);
        throw new Error(SESSION_LOST_MESSAGE);
      }
    },
    onSuccess: () => { setDraft(emptyPasswordDraft); setTouched(false); setDone(true); },
  });
  const problem = touched ? validatePasswordDraft(draft) : null;
  const submit = () => {
    setTouched(true); setDone(false);
    if (!canSubmitPassword(draft, mutation.isPending)) return;
    mutation.mutate(draft);
  };
  const set = (key: keyof PasswordDraft) => (value: string) => { setDraft((prev) => ({ ...prev, [key]: value })); setDone(false); };
  return (
    <View style={s.card} testID="account-password-section">
      <Text style={s.title} accessibilityRole="header">Cambiar contraseña</Text>
      <Text style={s.hint}>Al cambiarla se cierran las sesiones abiertas en otros dispositivos. Esta sesión sigue activa.</Text>
      <Field label="Contraseña actual" testID="account-password-current" value={draft.current} onChangeText={set('current')}
        error={problem?.field === 'current' ? problem.message : undefined} secureTextEntry autoCapitalize="none" autoCorrect={false}
        autoComplete="current-password" textContentType="password" editable={!mutation.isPending} />
      <Field label="Nueva contraseña" testID="account-password-next" value={draft.next} onChangeText={set('next')}
        error={problem?.field === 'next' ? problem.message : undefined} secureTextEntry autoCapitalize="none" autoCorrect={false}
        autoComplete="new-password" textContentType="newPassword" editable={!mutation.isPending} />
      <Field label="Confirmar nueva contraseña" testID="account-password-confirm" value={draft.confirmation} onChangeText={set('confirmation')}
        error={problem?.field === 'confirmation' ? problem.message : undefined} secureTextEntry autoCapitalize="none" autoCorrect={false}
        autoComplete="new-password" textContentType="newPassword" editable={!mutation.isPending} onSubmitEditing={submit} />
      {mutation.isError ? (
        <Text testID="account-password-error" accessibilityRole="alert" accessibilityLiveRegion="assertive" style={formStyles.serverErr}>
          {mutation.error instanceof Error && mutation.error.message === SESSION_LOST_MESSAGE ? SESSION_LOST_MESSAGE : describeError(mutation.error).message}
        </Text>
      ) : null}
      {done ? <Text testID="account-password-done" accessibilityLiveRegion="polite" style={s.ok}>{PASSWORD_CHANGED_MESSAGE}</Text> : null}
      <Button title={mutation.isPending ? 'Guardando…' : 'Cambiar contraseña'} testID="account-password-submit"
        disabled={mutation.isPending} onPress={submit} />
    </View>
  );
}

function NotificationsSection() {
  const { scope, enabled } = useProfileScope();
  const qc = useQueryClient();
  const key = ['account-settings', ...scope, 'preferences'];
  const prefs = useQuery({ queryKey: key, queryFn: () => api.getPreferences(), enabled, retry: false });
  const [draft, setDraft] = useState<{ email: boolean; push: boolean } | null>(null);
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    retry: false,
    mutationFn: (value: { email: boolean; push: boolean }) => api.savePreferences(value.email, value.push),
    onSuccess: (value) => { qc.setQueryData(key, value); setDraft(null); setSaved(true); },
  });
  useEffect(() => { if (prefs.data) setDraft(null); }, [prefs.data]);
  const current = draft ?? (prefs.data ? { email: prefs.data.alerts_email, push: prefs.data.alerts_push } : null);
  const base = prefs.data ? { email: prefs.data.alerts_email, push: prefs.data.alerts_push } : null;
  return (
    <View style={s.card} testID="account-notifications-section">
      <Text style={s.title} accessibilityRole="header">Notificaciones</Text>
      <Text style={s.hint}>
        Sus elecciones se guardan ahora y se aplicarán cuando se activen los envíos de alertas. Todavía no se envía ningún aviso por
        correo ni al teléfono.
      </Text>
      {prefs.isLoading ? <Loading label="Cargando preferencias…" /> : null}
      {prefs.isError ? <ErrorView error={prefs.error} onRetry={() => void prefs.refetch()} /> : null}
      {current && base ? (
        <View style={{ gap: spacing.md }}>
          <View style={s.row}>
            <Text style={s.label} accessibilityRole="text">Avisos de consumo por correo</Text>
            <Switch testID="account-pref-email" value={current.email} disabled={save.isPending}
              accessibilityLabel="Avisos de consumo por correo" onValueChange={(email) => { setSaved(false); setDraft({ ...current, email }); }} />
          </View>
          <View style={s.row}>
            <Text style={s.label} accessibilityRole="text">Avisos en este teléfono</Text>
            <Switch testID="account-pref-push" value={current.push} disabled={save.isPending}
              accessibilityLabel="Avisos en este teléfono" onValueChange={(push) => { setSaved(false); setDraft({ ...current, push }); }} />
          </View>
          {save.isError ? <Text accessibilityRole="alert" style={formStyles.serverErr}>{describeError(save.error).message}</Text> : null}
          {saved ? <Text accessibilityLiveRegion="polite" style={s.ok}>Preferencias guardadas.</Text> : null}
          <Button title={save.isPending ? 'Guardando…' : 'Guardar preferencias'} testID="account-pref-save"
            disabled={save.isPending || !preferencesChanged(base, current)} onPress={() => { setSaved(false); save.mutate(current); }} />
        </View>
      ) : null}
    </View>
  );
}

function SessionsSection() {
  const { scope, enabled } = useProfileScope();
  const qc = useQueryClient();
  const key = ['account-settings', ...scope, 'sessions'];
  const sessions = useQuery({ queryKey: key, queryFn: () => api.listSessions(), enabled, retry: false });
  const [notice, setNotice] = useState<string | null>(null);
  const run = useMutation({
    retry: false,
    mutationFn: ({ action }: { action: () => Promise<unknown>; message: string }) => action(),
    onSuccess: (_value, variables) => { setNotice(variables.message); void qc.invalidateQueries({ queryKey: key }); },
  });
  const others = sessions.data?.filter((item) => !item.current) ?? [];
  return (
    <View style={s.card} testID="account-sessions-section">
      <Text style={s.title} accessibilityRole="header">Sesiones activas</Text>
      <Text style={s.hint}>Dispositivos donde su cuenta tiene la sesión abierta. Si no reconoce alguno, ciérrela y cambie su contraseña.</Text>
      {sessions.isLoading ? <Loading label="Cargando sesiones…" /> : null}
      {sessions.isError ? <ErrorView error={sessions.error} onRetry={() => void sessions.refetch()} /> : null}
      {sessions.data?.map((item) => (
        <View key={item.id} style={s.row} testID={`account-session-${item.id}`}>
          <Text style={s.label}>Iniciada el {formatSessionDate(item.created_at)}{item.current ? ' · Esta sesión' : ''}</Text>
          {!item.current ? (
            <Button title="Cerrar" variant="secondary" disabled={run.isPending}
              onPress={() => run.mutate({ action: () => api.revokeSession(item.id), message: 'Sesión cerrada.' })} />
          ) : null}
        </View>
      ))}
      {run.isError ? <Text accessibilityRole="alert" style={formStyles.serverErr}>{describeError(run.error).message}</Text> : null}
      {notice ? <Text accessibilityLiveRegion="polite" style={s.ok}>{notice}</Text> : null}
      {others.length > 0 ? (
        <Button title="Cerrar las demás sesiones" variant="secondary" testID="account-sessions-revoke-others" disabled={run.isPending}
          onPress={() => run.mutate({ action: () => api.revokeOtherSessions(), message: 'Se cerraron las demás sesiones.' })} />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.lg },
  card: { backgroundColor: colors.card, padding: spacing.lg, borderRadius: 12, borderWidth: 1, borderColor: colors.border, gap: spacing.md },
  title: { color: colors.text, fontSize: 18, fontWeight: '600' },
  hint: { color: colors.muted, lineHeight: 20 },
  label: { color: colors.text, flex: 1, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  ok: { color: colors.success ?? colors.primary, fontWeight: '600' },
});
