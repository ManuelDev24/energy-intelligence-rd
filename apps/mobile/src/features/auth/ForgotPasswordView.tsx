import { useMemo, useReducer, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { authClient } from '../../auth/runtime';
import { Field, formStyles } from '../../components/Field';
import { Button } from '../../components/ui';
import { colors, font, spacing } from '../../theme';
import { FORGOT_CONFIRMATION, createForgotSubmitter, forgotReducer, initialForgotState } from './forgotPassword';

/** ERD-AUTH-05: solicitud de enlace de restablecimiento. El restablecimiento ocurre en la web
 *  (enlace del correo); el móvil no implementa todavía el enlace profundo nativo. */
export function ForgotPasswordView({ initialEmail, onBack }: { initialEmail: string; onBack: () => void }) {
  const emailRef = useRef<TextInput>(null);
  const [email, setEmail] = useState(initialEmail);
  const [state, dispatch] = useReducer(forgotReducer, initialForgotState);
  const submit = useMemo(() => createForgotSubmitter((value) => authClient.forgotPassword(value), dispatch), []);
  const busy = state.status === 'submitting';
  const send = () => {
    void submit(email).then((ok) => { if (!ok) emailRef.current?.focus(); });
  };
  if (state.status === 'sent') {
    return (
      <View style={{ gap: spacing.md }}>
        <Text testID="auth-forgot-confirmation" accessibilityRole="alert" accessibilityLiveRegion="polite" style={body}>{FORGOT_CONFIRMATION}</Text>
        <Button title="Volver a iniciar sesión" testID="auth-forgot-back" onPress={onBack} />
      </View>
    );
  }
  return (
    <View style={{ gap: spacing.md }} accessibilityState={{ busy }}>
      <Text style={body}>Escriba el correo de su cuenta. Le enviaremos un enlace para crear una contraseña nueva.</Text>
      {state.error ? <Text testID="auth-forgot-error" accessibilityRole="alert" accessibilityLiveRegion="assertive" style={formStyles.serverErr}>{state.error}</Text> : null}
      <Field label="Correo electrónico" inputRef={emailRef} testID="auth-forgot-email" value={email}
        onChangeText={(next) => { setEmail(next); dispatch({ type: 'edited' }); }} error={state.fieldError ?? undefined}
        keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress"
        returnKeyType="send" editable={!busy} onSubmitEditing={send} />
      <Button title={busy ? 'Enviando…' : 'Enviar enlace'} disabled={busy} testID="auth-forgot-submit" onPress={send} />
      <Button title="Volver a iniciar sesión" variant="secondary" disabled={busy} testID="auth-forgot-back" onPress={onBack} />
    </View>
  );
}
const body = { fontSize: font.md, lineHeight: 23, color: colors.muted } as const;
