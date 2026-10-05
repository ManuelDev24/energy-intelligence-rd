import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError } from '../../api/client';
import { validateCredentials, type CredentialErrors } from '../../auth/client';
import { authSession, useAuth } from '../../auth/runtime';
import { Field, formStyles } from '../../components/Field';
import { Button } from '../../components/ui';
import { colors, font, spacing } from '../../theme';

export function AuthScreen() {
  const state = useAuth();
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fields, setFields] = useState<CredentialErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(false);
  const busy = state.status === 'busy';
  const submit = async () => {
    if (busy) return;
    const validation = validateCredentials(email, password);
    setFields(validation);
    setError(null);
    if (Object.keys(validation).length) {
      (validation.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    const secret = password;
    setPassword(''); // Only transient input memory. Never persist or log credentials.
    try { await authSession[mode](email, secret); }
    catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'No se pudo iniciar sesión. Intente de nuevo.');
      if (failure instanceof ApiError) setFields(failure.fieldErrors);
    }
  };
  return (
    <SafeAreaView style={s.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
          <Text style={s.brand}>Energy RD</Text>
          <Text accessibilityRole="header" style={s.title}>{mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</Text>
          <Text style={s.body}>Sus viviendas y facturas están vinculadas a su cuenta.</Text>
          {state.message && !error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.body}>{state.message}</Text> : null}
          {error ? <Text testID="auth-error" accessibilityRole="alert" accessibilityLiveRegion="assertive" style={formStyles.serverErr}>{error}</Text> : null}
          <View style={{ gap: spacing.md }} accessibilityState={{ busy }}>
            <Field label="Correo electrónico" inputRef={emailRef} testID="auth-email" value={email} onChangeText={setEmail} error={fields.email}
              keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" editable={!busy} />
            <Field label="Contraseña" inputRef={passwordRef} testID="auth-password" value={password} onChangeText={setPassword} error={fields.password}
              secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              // iOS 27 / Expo Go: newPassword leaves a blank input view and drops typed registration text.
              // Keep secure entry + password autofill; the full native Phase 2 flow guards registration.
              textContentType="password" editable={!busy} onSubmitEditing={() => void submit()} />
            <Text style={s.body}>Use entre 12 y 128 caracteres. El correo no se verifica en esta versión.</Text>
            <Button title={busy ? 'Procesando…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'} disabled={busy} onPress={() => void submit()} testID="auth-submit" />
            <Button title={mode === 'login' ? 'Crear una cuenta nueva' : 'Ya tengo cuenta'} variant="secondary" disabled={busy} testID="auth-mode"
              onPress={() => { setMode(mode === 'login' ? 'register' : 'login'); setFields({}); setError(null); setPassword(''); setRecovery(false); }} />
            <Button title="¿Olvidó su contraseña?" variant="secondary" disabled={busy} testID="auth-recovery" onPress={() => setRecovery(true)} />
          </View>
          {recovery ? <Text testID="auth-recovery-unavailable" accessibilityLiveRegion="polite" style={s.body}>
            La recuperación de contraseña aún no está disponible. No podemos enviar un enlace ni cambiar su contraseña desde esta aplicación. Si recuerda su contraseña, vuelva a iniciar sesión.
          </Text> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, padding: spacing.xl, gap: spacing.lg },
  brand: { fontSize: font.md, fontWeight: '700', color: colors.primary },
  title: { fontSize: font.xl, fontWeight: '700', color: colors.text },
  body: { fontSize: font.md, lineHeight: 23, color: colors.muted },
});
