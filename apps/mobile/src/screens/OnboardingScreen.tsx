import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../components/ui';
import { useSession } from '../store/session';
import { colors, spacing } from '../theme';
import { HomeList } from './HomesScreen';

const STEPS = [
  {
    title: 'Bienvenido a Energy RD',
    body: 'Lleve el control de su consumo eléctrico a partir de las facturas mensuales de su distribuidora.',
  },
  {
    title: 'Registre sus facturas',
    body: 'Ingrese manualmente cada factura: período, días, kWh y monto en RD$. Con ellas verá su historial.',
  },
  {
    title: 'Entienda sus datos',
    body: 'Cada cifra indica si es REAL (de su factura), ESTIMADA (promedios) o PROYECTADA. No hay datos horarios: una factura mensual no los puede medir.',
  },
];

export function OnboardingScreen() {
  const [step, setStep] = useState(0);
  const complete = useSession((st) => st.completeOnboarding);
  const selected = useSession((st) => st.selectedHomeId);
  const picking = step >= STEPS.length;

  return (
    <SafeAreaView style={s.screen}>
      {picking ? (
        <View style={{ flex: 1 }}>
          <View style={s.pad}>
            <Text style={s.title}>Elija su vivienda</Text>
            <Text style={s.body}>Podrá cambiarla luego desde la pestaña Viviendas.</Text>
          </View>
          <HomeList />
          <View style={s.pad}>
            <Button title="Continuar" onPress={complete} disabled={!selected} testID="onboarding-finish" />
          </View>
        </View>
      ) : (
        <View style={[s.pad, { flex: 1, justifyContent: 'space-between' }]}>
          <View style={{ gap: spacing.md, marginTop: spacing.xl }}>
            <Text style={s.step}>
              Paso {step + 1} de {STEPS.length}
            </Text>
            <Text style={s.title}>{STEPS[step].title}</Text>
            <Text style={s.body}>{STEPS[step].body}</Text>
          </View>
          <View style={{ gap: spacing.sm }}>
            <Button title="Siguiente" onPress={() => setStep(step + 1)} testID="onboarding-next" />
            <Button title="Omitir" variant="secondary" onPress={() => setStep(STEPS.length)} testID="onboarding-skip" />
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pad: { padding: spacing.xl, gap: spacing.sm },
  step: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  body: { fontSize: 16, color: colors.muted, lineHeight: 22 },
});
