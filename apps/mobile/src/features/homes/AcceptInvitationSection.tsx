import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { StyleSheet, Text, View } from 'react-native';
import { api } from '../../api/client';
import { parseInvitationLink } from '../../api/account';
import { describeError } from '../../api/errors';
import type { Home } from '../../api/types';
import { Field, formStyles } from '../../components/Field';
import { Button } from '../../components/ui';
import { useSession } from '../../store/session';
import { colors, spacing } from '../../theme';

/**
 * ERD-SHARE-01: aceptar una invitación pegando el enlace del correo. El token no se guarda: vive en el estado de esta
 * sección y se descarta al aceptar. Hay que tener la sesión iniciada con el correo al que llegó la invitación.
 * No verificado en dispositivo (docs/qa/ERD-SHARE-01.md).
 */
export function AcceptInvitationSection({ onAccepted }: { onAccepted?: (home: Home) => void }) {
  const [link, setLink] = useState('');
  const [problem, setProblem] = useState<string | undefined>();
  const qc = useQueryClient();
  const accept = useMutation({
    retry: false,
    mutationFn: (token: string) => api.acceptInvitation(token),
    onSuccess: async (home) => {
      setLink('');
      await qc.invalidateQueries({ queryKey: ['homes'] });
      useSession.getState().selectHome(home.id);
      onAccepted?.(home);
    },
  });
  const submit = () => {
    if (accept.isPending) return;
    const token = parseInvitationLink(link);
    if (!token) { setProblem('Pegue el enlace completo del correo de invitación.'); return; }
    setProblem(undefined);
    accept.mutate(token);
  };
  return (
    <View style={s.card} testID="accept-invitation-section">
      <Text style={s.title} accessibilityRole="header">¿Le invitaron a una vivienda?</Text>
      <Text style={s.hint}>Pegue el enlace del correo. Debe haber iniciado sesión con el mismo correo al que llegó la invitación.</Text>
      <Field label="Enlace de invitación" testID="accept-invitation-link" value={link} onChangeText={(value) => { setLink(value); setProblem(undefined); }}
        error={problem} autoCapitalize="none" autoCorrect={false} autoComplete="off" editable={!accept.isPending} onSubmitEditing={submit} />
      {accept.isError ? <Text testID="accept-invitation-error" accessibilityRole="alert" accessibilityLiveRegion="assertive" style={formStyles.serverErr}>{describeError(accept.error).message}</Text> : null}
      <Button title={accept.isPending ? 'Aceptando…' : 'Aceptar invitación'} testID="accept-invitation-submit" disabled={accept.isPending} onPress={submit} />
    </View>
  );
}

const s = StyleSheet.create({
  card: { marginHorizontal: spacing.lg, backgroundColor: colors.card, padding: spacing.lg, borderRadius: 12, borderWidth: 1, borderColor: colors.border, gap: spacing.md },
  title: { color: colors.text, fontSize: 16, fontWeight: '600' },
  hint: { color: colors.muted, lineHeight: 20 },
});
