import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../../api/client';
import { describeError } from '../../api/errors';
import { Field, formStyles } from '../../components/Field';
import { Button, ErrorView, Loading, TextAction } from '../../components/ui';
import { useSession } from '../../store/session';
import { colors, spacing } from '../../theme';
import { useProfileScope } from './hooks';
import { canConfirmShare, confirmCopy, isNotOwnerError, looksLikeEmail, roleLabel, type ShareConfirm } from './accountSettings';

/**
 * ERD-SHARE-01: compartir la vivienda seleccionada. La propietaria invita (correo), revoca, saca integrantes y transfiere
 * la propiedad (con contraseña); una integrante solo puede salir. No verificado en dispositivo (docs/qa/ERD-SHARE-01.md).
 */
export function ShareHomeScreen() {
  const homeId = useSession((state) => state.selectedHomeId);
  const { scope, enabled } = useProfileScope();
  const qc = useQueryClient();
  const base = ['sharing', ...scope, homeId ?? 'none'];
  const members = useQuery({ queryKey: [...base, 'members'], queryFn: () => api.listMembers(homeId!), enabled: enabled && !!homeId, retry: false });
  const isMember = isNotOwnerError(members.error);
  const isOwner = members.isSuccess;
  const invitations = useQuery({ queryKey: [...base, 'invitations'], queryFn: () => api.listInvitations(homeId!), enabled: isOwner, retry: false });
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState<ShareConfirm | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: base }), qc.invalidateQueries({ queryKey: ['homes'] })]);
  const run = useMutation({
    retry: false,
    mutationFn: ({ action }: { action: () => Promise<unknown>; message: string; after?: () => void }) => action(),
    onMutate: () => setNotice(null),
    onSuccess: async (_value, variables) => { setNotice(variables.message); await refresh(); variables.after?.(); },
  });

  if (!homeId) return <View style={s.screen}><Text style={s.hint}>Seleccione una vivienda para compartirla.</Text></View>;
  const invite = () => {
    if (!looksLikeEmail(email)) { setEmailError('Ingrese un correo válido.'); return; }
    setEmailError(undefined);
    run.mutate({ action: () => api.createInvitation(homeId, email), message: `Invitación enviada a ${email.trim().toLowerCase()}. Caduca en 7 días.`, after: () => setEmail('') });
  };
  const confirmNow = () => {
    if (!confirm || !canConfirmShare(confirm, password, run.isPending)) return;
    const current = confirm;
    const done = () => { setConfirm(null); setPassword(''); };
    if (current.kind === 'leave') run.mutate({ action: () => api.leaveHome(homeId), message: 'Salió de la vivienda.', after: () => { done(); useSession.getState().selectHome(null); } });
    else if (current.kind === 'remove') run.mutate({ action: () => api.removeMember(homeId, current.member.user_id), message: 'Integrante retirada.', after: done });
    else run.mutate({ action: () => api.transferOwnership(homeId, current.member.user_id, password), message: 'Propiedad transferida. Ahora usted es integrante.', after: done });
  };
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      {members.isLoading ? <Loading label="Cargando integrantes…" /> : null}
      {members.isError && !isMember ? <ErrorView error={members.error} onRetry={() => void members.refetch()} /> : null}
      {run.isError ? <Text testID="share-error" accessibilityRole="alert" accessibilityLiveRegion="assertive" style={formStyles.serverErr}>{describeError(run.error).message}</Text> : null}
      {notice ? <Text accessibilityLiveRegion="polite" style={s.ok}>{notice}</Text> : null}

      {isOwner ? (
        <>
          <View style={s.card} testID="share-members">
            <Text style={s.title} accessibilityRole="header">Integrantes</Text>
            {members.data.map((member) => (
              <View key={member.user_id} style={s.item}>
                <Text style={s.label}>{member.email} · {roleLabel(member.role)}</Text>
                {member.role === 'member' ? (
                  <View style={s.actions}>
                    <Button title="Transferir propiedad" variant="secondary" disabled={run.isPending} accessibilityLabel={`Transferir la propiedad a ${member.email}`}
                      onPress={() => { setConfirm({ kind: 'transfer', member }); run.reset(); }} />
                    <Button title="Sacar" variant="secondary" disabled={run.isPending} accessibilityLabel={`Sacar a ${member.email}`}
                      onPress={() => { setConfirm({ kind: 'remove', member }); run.reset(); }} />
                  </View>
                ) : null}
              </View>
            ))}
          </View>
          <View style={s.card} testID="share-invite">
            <Text style={s.title} accessibilityRole="header">Invitar</Text>
            <Text style={s.hint}>Recibirá un enlace de un solo uso. Debe abrirlo con una cuenta de ese mismo correo.</Text>
            <Field label="Correo de la persona invitada" testID="share-email" value={email} onChangeText={setEmail} error={emailError}
              keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="off" editable={!run.isPending} onSubmitEditing={invite} />
            <Button title={run.isPending ? 'Enviando…' : 'Enviar invitación'} testID="share-invite-submit" disabled={run.isPending} onPress={invite} />
          </View>
          <View style={s.card} testID="share-pending">
            <Text style={s.title} accessibilityRole="header">Invitaciones pendientes</Text>
            {invitations.isSuccess && invitations.data.length === 0 ? <Text style={s.hint}>No hay invitaciones pendientes.</Text> : null}
            {invitations.data?.map((invitation) => (
              <View key={invitation.id} style={s.item}>
                <Text style={s.label}>{invitation.email}</Text>
                <Button title="Revocar" variant="secondary" disabled={run.isPending} accessibilityLabel={`Revocar la invitación a ${invitation.email}`}
                  onPress={() => run.mutate({ action: () => api.revokeInvitation(homeId, invitation.id), message: 'Invitación revocada.' })} />
              </View>
            ))}
          </View>
        </>
      ) : null}

      {isMember || isOwner ? (
        <View style={s.card}>
          <Text style={s.hint}>{isMember ? 'Usted es integrante: puede ver y usar la vivienda, pero solo la propietaria gestiona quién más accede.' : 'Si ya no quiere gestionar esta vivienda, transfiera la propiedad antes de salir.'}</Text>
          {confirm?.kind !== 'leave' ? <Button title="Salir de la vivienda" variant="secondary" testID="share-leave" disabled={run.isPending} onPress={() => { setConfirm({ kind: 'leave' }); run.reset(); }} /> : null}
        </View>
      ) : null}

      {confirm ? (
        <View style={s.card} testID="share-confirm">
          <Text accessibilityRole="alert" style={s.label}>{confirmCopy(confirm)}</Text>
          {confirm.kind === 'transfer' ? (
            <Field label="Su contraseña" testID="share-password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none"
              autoCorrect={false} autoComplete="current-password" textContentType="password" editable={!run.isPending} onSubmitEditing={confirmNow} />
          ) : null}
          <Button title={run.isPending ? 'Guardando…' : 'Confirmar'} testID="share-confirm-submit" disabled={!canConfirmShare(confirm, password, run.isPending)} onPress={confirmNow} />
          <TextAction title="Cancelar" tone="muted" testID="share-confirm-cancel" onPress={() => { setConfirm(null); setPassword(''); run.reset(); }} />
        </View>
      ) : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  content: { padding: spacing.lg, gap: spacing.lg },
  card: { backgroundColor: colors.card, padding: spacing.lg, borderRadius: 12, borderWidth: 1, borderColor: colors.border, gap: spacing.md },
  title: { color: colors.text, fontSize: 18, fontWeight: '600' },
  hint: { color: colors.muted, lineHeight: 20 },
  label: { color: colors.text, lineHeight: 20 },
  item: { gap: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  ok: { color: colors.success ?? colors.primary, fontWeight: '600' },
});
