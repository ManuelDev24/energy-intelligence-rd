import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, ApiError } from '../../api/client';
import { describeError } from '../../api/errors';
import { keys } from '../../api/hooks';
import type { Distributor, Home } from '../../api/types';
import { authSession } from '../../auth/runtime';
import { Field, formStyles } from '../../components/Field';
import { Button } from '../../components/ui';
import { useSession } from '../../store/session';
import { colors, font, radius, spacing, TOUCH } from '../../theme';
const DISTRIBUTORS: Distributor[] = ['EDESUR', 'EDENORTE', 'EDEESTE', 'Otra'];
export function CreateHomeForm({ onCreated, onCancel }: { onCreated?: (home: Home) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [distributor, setDistributor] = useState<Distributor>('EDESUR');
  const [fieldError, setFieldError] = useState<string>();
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: async () => {
      const epoch = authSession.getSnapshot().epoch;
      const home = await api.createHome({ name, distributor });
      authSession.checkEpoch(epoch);
      return home;
    },
    retry: false,
    onSuccess: (home) => {
      qc.setQueryData<Home[]>(keys.homes, (homes = []) => [...homes.filter((h) => h.id !== home.id), home]);
      void qc.invalidateQueries({ queryKey: keys.homes });
      useSession.getState().selectHome(home.id);
      onCreated?.(home);
    },
  });
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView contentContainerStyle={s.form} keyboardShouldPersistTaps="handled">
      <Text style={s.title} accessibilityRole="header">Nueva vivienda</Text>
      <Text style={s.body}>Se creará una vivienda de su cuenta, sin datos piloto. Registre sus facturas después.</Text>
      {mutation.isError ? <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" testID="auth-home-error" style={formStyles.serverErr}>
        {mutation.error instanceof ApiError ? describeError(mutation.error).message : 'No se pudo crear la vivienda. Actualice la lista e intente de nuevo.'}
      </Text> : null}
      <Field label="Nombre de la vivienda" testID="auth-home-name" value={name} onChangeText={setName} error={fieldError} editable={!mutation.isPending} />
      <Text style={s.body}>Distribuidora</Text>
      <View style={s.options} accessibilityRole="radiogroup">
        {DISTRIBUTORS.map((value) => <Pressable key={value} testID={`auth-distributor-${value}`} accessibilityRole="radio"
          accessibilityLabel={value} accessibilityState={{ checked: value === distributor, disabled: mutation.isPending }} disabled={mutation.isPending}
          onPress={() => setDistributor(value)} style={[s.option, value === distributor && s.selected]}>
          <Text style={s.optionText}>{value === distributor ? '✓ ' : ''}{value}</Text>
        </Pressable>)}
      </View>
      <Button title={mutation.isPending ? 'Creando…' : 'Crear vivienda'} testID="auth-home-create" disabled={mutation.isPending} onPress={() => {
        if (!name.trim() || Array.from(name.trim()).length > 120) { setFieldError('Ingrese un nombre de 1 a 120 caracteres.'); return; }
        setFieldError(undefined);
        mutation.mutate();
      }} />
      <Button title="Volver a mis viviendas" variant="secondary" disabled={mutation.isPending} onPress={onCancel} />
    </ScrollView>
  </KeyboardAvoidingView>;
}
const s = StyleSheet.create({
  form: { padding: spacing.lg, gap: spacing.md },
  title: { fontSize: font.xl, fontWeight: '700', color: colors.text },
  body: { fontSize: font.md, color: colors.muted, lineHeight: 22 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: { minHeight: TOUCH, justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.md, backgroundColor: colors.card },
  selected: { borderColor: colors.primary, borderWidth: 2 },
  optionText: { color: colors.text, fontSize: font.md },
});
