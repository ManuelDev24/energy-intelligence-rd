import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';

import { ApiError } from '../api/client';
import { useEquipmentItem, useSaveEquipment } from '../api/hooks';
import { Field, formStyles } from '../components/Field';
import { Button, EmptyView, ErrorView, Loading, QualityBadge } from '../components/ui';
import {
  previewDailyKwh, validateEquipment, type EquipmentFormErrors, type EquipmentFormValues,
} from '../lib/equipmentForm';
import { fmtNumber } from '../lib/format';
import { useSession } from '../store/session';
import { colors, spacing } from '../theme';

const EMPTY: EquipmentFormValues = { name: '', room: '', powerW: '', hoursPerDay: '' };
const API_FIELDS: Record<string, keyof EquipmentFormValues> = {
  name: 'name', room: 'room', power_w: 'powerW', hours_per_day: 'hoursPerDay',
};

export function EquipmentFormScreen({ equipmentId, onDone }: { equipmentId?: string; onDone: () => void }) {
  const homeId = useSession((st) => st.selectedHomeId);
  const existing = useEquipmentItem(homeId, equipmentId);
  const save = useSaveEquipment(homeId ?? '', equipmentId);
  const [v, setV] = useState<EquipmentFormValues>(EMPTY);
  const [loaded, setLoaded] = useState(!equipmentId);
  const [errors, setErrors] = useState<EquipmentFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (existing.data && !loaded) {
      const e = existing.data;
      setV({ name: e.name, room: e.room ?? '', powerW: String(Number(e.power_w)), hoursPerDay: String(Number(e.hours_per_day)) });
      setLoaded(true);
    }
  }, [existing.data, loaded]);

  if (!homeId) return <EmptyView title="Seleccione una vivienda" />;
  if (equipmentId && existing.isLoading) return <Loading label="Cargando equipo…" />;
  if (equipmentId && existing.isError) return <ErrorView error={existing.error} onRetry={() => void existing.refetch()} />;

  const set = (k: keyof EquipmentFormValues) => (t: string) => setV((p) => ({ ...p, [k]: t }));
  const preview = previewDailyKwh(v);

  const submit = () => {
    setServerError(null);
    const { errors: errs, input } = validateEquipment(v);
    setErrors(errs);
    if (!input) return;
    save.mutate(input, {
      onSuccess: onDone,
      onError: (e) => {
        if (e instanceof ApiError) {
          const fe: EquipmentFormErrors = {};
          for (const [k, msg] of Object.entries(e.fieldErrors)) if (API_FIELDS[k]) fe[API_FIELDS[k]] = msg;
          setErrors(fe);
          setServerError(e.message);
        } else setServerError('Ocurrió un error inesperado');
      },
    });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
        <Field label="Nombre del equipo" testID="eq-name" value={v.name} onChangeText={set('name')} error={errors.name} placeholder="Nevera" />
        <Field label="Habitación (opcional)" testID="eq-room" value={v.room} onChangeText={set('room')} error={errors.room} placeholder="Cocina" />
        <Field label="Potencia (W)" testID="eq-power" value={v.powerW} onChangeText={set('powerW')} error={errors.powerW} keyboardType="decimal-pad" placeholder="150" />
        <Field label="Horas de uso por día (0–24)" testID="eq-hours" value={v.hoursPerDay} onChangeText={set('hoursPerDay')} error={errors.hoursPerDay} keyboardType="decimal-pad" placeholder="24" />
        {preview !== null ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }} testID="eq-preview">
            <Text style={{ color: colors.muted, fontSize: 13 }}>Vista previa: ≈ {fmtNumber(preview)} kWh/día</Text>
            <QualityBadge quality="ESTIMATED" />
          </View>
        ) : null}
        {serverError ? (
          <Text style={formStyles.serverErr} testID="server-error" accessibilityRole="alert">
            {serverError}
          </Text>
        ) : null}
        <Button title={save.isPending ? 'Guardando…' : 'Guardar equipo'} onPress={submit} disabled={save.isPending} testID="save-equipment" />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
