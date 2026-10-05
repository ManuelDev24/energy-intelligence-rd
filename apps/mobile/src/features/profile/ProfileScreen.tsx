import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useHomes } from '../../api/hooks';
import { AUTH_ENABLED } from '../../config';
import { AccountSummary } from '../auth/AccountSummary';
import { Button } from '../../components/ui';
import { useSession } from '../../store/session';
import { colors, spacing } from '../../theme';

export function ProfileScreen({ onHome, onService, onHomes }: { onHome: () => void; onService: () => void; onHomes: () => void }) {
  const homeId = useSession(state => state.selectedHomeId);
  const home = useHomes().data?.find(item => item.id === homeId);
  return <ScrollView style={s.screen} contentContainerStyle={s.content}>
    <Text style={s.title} accessibilityRole="header">Perfil</Text>
    {AUTH_ENABLED ? <AccountSummary /> : <Text style={s.hint}>Modo piloto: sin cuenta personal. La edición del perfil no está habilitada.</Text>}
    <View style={s.card}>
      <Text style={s.subtitle} accessibilityRole="header">{home?.name ?? 'Seleccione una vivienda'}</Text>
      <Button title="Mi vivienda" testID="profile-home" variant="secondary" disabled={!homeId} onPress={onHome} />
      <Button title="Mi servicio" testID="profile-service" variant="secondary" disabled={!homeId} onPress={onService} />
      <Button title="Cambiar vivienda" testID="profile-homes" variant="secondary" onPress={onHomes} />
    </View>
    <View style={s.card}>
      <Text style={s.subtitle} accessibilityRole="header">Ajustes de cuenta</Text>
      <Text style={s.hint}>Notificaciones, preferencias, cambio de correo o contraseña y eliminación de cuenta: No disponible. La API aún no ofrece estos ajustes; no se guardan preferencias simuladas en el dispositivo.</Text>
    </View>
    <Text style={s.hint}>El perfil describe su vivienda. No calcula consumo, ahorro ni tarifas automáticamente.</Text>
  </ScrollView>;
}
const s = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.bg }, content: { padding: spacing.lg, gap: spacing.lg }, title: { color: colors.text, fontSize: 24, fontWeight: '700' }, subtitle: { color: colors.text, fontSize: 18, fontWeight: '600' }, hint: { color: colors.muted, lineHeight: 22 }, card: { backgroundColor: colors.card, padding: spacing.lg, borderRadius: 12, borderWidth: 1, borderColor: colors.border, gap: spacing.md } });
