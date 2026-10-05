import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { StyleSheet, Text, View } from 'react-native';
import { api } from '../../api/client';
import { describeError } from '../../api/errors';
import { authSession } from '../../auth/runtime';
import { Field, formStyles } from '../../components/Field';
import { Button, TextAction } from '../../components/ui';
import { colors, spacing } from '../../theme';
import {
  canSubmitDeletion, initialDeletionDraft, isOwnershipTransferRequired, validateDeletionPassword,
  type DeletionDraft,
} from './accountDeletion';

/**
 * ERD-AUTH-03: zona de peligro del perfil. Dos pasos (abrir -> confirmar con contraseña) y
 * `mutation.isPending` bloquean el doble envío. Al recibir 204 se limpia la sesión exactamente
 * como en el cierre de sesión (SecureStore + caché de React Query) y se vuelve a la pantalla de
 * acceso con un mensaje de confirmación; nunca se muestra el detalle crudo del servidor.
 */
const SUCCESS_MESSAGE =
  'Su cuenta se eliminó correctamente. Los datos de las viviendas donde usted era la única integrante también se eliminaron.';

export function AccountDeletionSection() {
  const [draft, setDraft] = useState<DeletionDraft>(initialDeletionDraft);
  const mutation = useMutation({
    retry: false,
    mutationFn: (password: string) => api.deleteAccount(password),
    onSuccess: () => { void authSession.invalidate(SUCCESS_MESSAGE); },
  });
  const passwordError = draft.password ? validateDeletionPassword(draft.password) : undefined;
  const serverError = mutation.isError ? describeError(mutation.error) : null;
  const ownershipBlocked = isOwnershipTransferRequired(mutation.error);
  const submit = () => {
    if (!canSubmitDeletion(draft.password, mutation.isPending) || ownershipBlocked) return;
    mutation.mutate(draft.password);
  };
  const cancel = () => { mutation.reset(); setDraft(initialDeletionDraft); };
  return (
    <View style={s.card} testID="profile-delete-account-section">
      <Text style={s.title} accessibilityRole="header">Eliminar cuenta</Text>
      <Text style={s.hint}>
        Esta acción es permanente. Las viviendas donde usted es la única integrante se eliminarán junto con sus
        lecturas, facturas y equipos. Si usted es la única propietaria de una vivienda compartida, no podrá
        eliminar su cuenta hasta transferir la propiedad (función aún no disponible).
      </Text>
      {draft.step === 'closed' ? (
        <Button title="Eliminar cuenta" variant="secondary" testID="profile-delete-account"
          onPress={() => setDraft({ step: 'confirm', password: '' })} />
      ) : (
        <View style={{ gap: spacing.md }}>
          <Text accessibilityRole="alert" style={s.hint}>
            Confirme su contraseña actual para eliminar la cuenta de forma permanente. Esta acción no se puede
            deshacer.
          </Text>
          <Field
            label="Contraseña actual" testID="profile-delete-password" value={draft.password}
            onChangeText={(password) => setDraft((prev) => ({ ...prev, password }))}
            error={passwordError}
            secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="current-password"
            textContentType="password" editable={!mutation.isPending} onSubmitEditing={submit}
          />
          {serverError ? (
            <Text testID="profile-delete-error" accessibilityRole="alert" accessibilityLiveRegion="assertive" style={formStyles.serverErr}>
              {serverError.message}
            </Text>
          ) : null}
          <Button
            title={mutation.isPending ? 'Eliminando…' : 'Confirmar eliminación'}
            testID="profile-delete-confirm"
            disabled={!canSubmitDeletion(draft.password, mutation.isPending) || ownershipBlocked}
            onPress={submit}
          />
          <TextAction title="Cancelar" tone="muted" testID="profile-delete-cancel" onPress={cancel} />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.card, padding: spacing.lg, borderRadius: 12, borderWidth: 1, borderColor: colors.danger, gap: spacing.md },
  title: { color: colors.danger, fontSize: 18, fontWeight: '600' },
  hint: { color: colors.muted, lineHeight: 20 },
});
