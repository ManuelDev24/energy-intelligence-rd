import { Alert, StyleSheet, Text, View } from 'react-native';
import { api } from '../../api/client';
import { unregisterPush } from '../../notifications/push';
import { authSession, useAuth } from '../../auth/runtime';
import { Button } from '../../components/ui';
import { colors, font, spacing } from '../../theme';
/** Primero se retira el token de avisos de este teléfono (máx. 2 s, necesita la sesión vigente) y luego se cierra la sesión. */
async function signOut() {
  await Promise.race([unregisterPush({ remove: api.removeDevice }), new Promise((resolve) => setTimeout(resolve, 2000))]);
  await authSession.logout();
}

export function AccountSummary() {
  const { user } = useAuth();
  return <View style={s.container}>
    {user ? <Text style={s.label}>Cuenta: {user.email}</Text> : null}
    <Button title="Cerrar sesión" variant="secondary" testID="auth-logout" onPress={() => {
      Alert.alert('¿Cerrar sesión?', 'Se eliminarán de este dispositivo la sesión y la vivienda seleccionada.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Cerrar sesión', style: 'destructive', onPress: () => { void signOut(); } },
      ]);
    }} />
  </View>;
}
const s = StyleSheet.create({ container: { padding: spacing.lg, gap: spacing.sm }, label: { color: colors.text, fontSize: font.md } });
