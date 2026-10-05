import { Alert, StyleSheet, Text, View } from 'react-native';
import { authSession, useAuth } from '../../auth/runtime';
import { Button } from '../../components/ui';
import { colors, font, spacing } from '../../theme';
export function AccountSummary() {
  const { user } = useAuth();
  return <View style={s.container}>
    {user ? <Text style={s.label}>Cuenta: {user.email}</Text> : null}
    <Button title="Cerrar sesión" variant="secondary" testID="auth-logout" onPress={() => {
      Alert.alert('¿Cerrar sesión?', 'Se eliminarán de este dispositivo la sesión y la vivienda seleccionada.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Cerrar sesión', style: 'destructive', onPress: () => { void authSession.logout(); } },
      ]);
    }} />
  </View>;
}
const s = StyleSheet.create({ container: { padding: spacing.lg, gap: spacing.sm }, label: { color: colors.text, fontSize: font.md } });
