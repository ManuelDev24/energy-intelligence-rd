import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';

import { ApiError } from '../../api/client';
import { describeError } from '../../api/errors';
import { useGoal, useSaveGoal } from '../../api/hooks';
import { Field, formStyles } from '../../components/Field';
import { KeyboardDoneBar, useKeyboardHeight } from '../../components/KeyboardDoneBar';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../components/states';
import { Button, EmptyView } from '../../components/ui';
import { useSession } from '../../store/session';
import { colors, spacing } from '../../theme';
import { GOAL_FIELD_MAP, goalToValues, validateGoal, type GoalFormErrors, type GoalFormValues } from './form';
import { isEndpointUnavailable } from './model';

export function GoalFormScreen({ onDone }: { onDone: () => void }) {
  const homeId = useSession((st) => st.selectedHomeId);
  const goal = useGoal(homeId);
  const save = useSaveGoal(homeId ?? '');
  const [v, setV] = useState<GoalFormValues>({ amount: '', kwh: '' });
  const [loaded, setLoaded] = useState(false);
  const [errors, setErrors] = useState<GoalFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const keyboardHeight = useKeyboardHeight();

  // Precarga una sola vez con la meta guardada (no pisa lo que el usuario ya escribió).
  useEffect(() => {
    if (loaded || !goal.isSuccess) return;
    setV(goalToValues(goal.data));
    setLoaded(true);
  }, [goal.isSuccess, goal.data, loaded]);

  if (!homeId) return <EmptyView title="Seleccione una vivienda" hint="Elija una vivienda antes de definir una meta." />;
  if (goal.isLoading) return <LoadingSkeleton label="Cargando la meta…" count={1} />;
  if (goal.isError && isEndpointUnavailable(goal.error))
    return <EmptyState icon="cloud-offline-outline" title="Metas no disponibles" hint="Este servidor todavía no ofrece metas mensuales." testID="goal-form-unavailable" />;
  if (goal.isError) return <ErrorState error={goal.error} onRetry={() => void goal.refetch()} />;

  const set = (k: keyof GoalFormValues) => (t: string) => setV((prev) => ({ ...prev, [k]: t }));
  const submit = () => {
    setServerError(null);
    const { errors: errs, input } = validateGoal(v);
    setErrors(errs);
    if (!input) return;
    save.mutate(input, {
      onSuccess: onDone,
      onError: (e) => {
        const fe: GoalFormErrors = {};
        if (e instanceof ApiError) for (const [k, msg] of Object.entries(e.fieldErrors)) if (GOAL_FIELD_MAP[k]) fe[GOAL_FIELD_MAP[k]] = msg;
        setErrors(fe);
        setServerError(describeError(e).message);
      },
    });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
        <Text style={s.intro}>
          Defina cuánto quiere gastar o consumir por mes calendario. Puede usar una meta o ambas; deje vacía la que no use.
        </Text>
        <Field label="Meta de monto (RD$ por mes)" testID="f-goal-amount" value={v.amount} onChangeText={set('amount')} error={errors.amount} keyboardType="decimal-pad" placeholder="3000" />
        <Field label="Meta de consumo (kWh por mes)" testID="f-goal-kwh" value={v.kwh} onChangeText={set('kwh')} error={errors.kwh} keyboardType="decimal-pad" placeholder="250" />
        {errors.form ? (
          <Text style={s.formErr} testID="goal-form-error" accessibilityLiveRegion="polite">
            {errors.form}
          </Text>
        ) : null}
        <Text style={s.note}>
          El monto en RD$ desde lecturas se estima con la tarifa oficial vigente (sin impuestos ni otros cargos) o con el precio medio de su última
          factura: es un valor ESTIMADO.
        </Text>
        {serverError ? (
          <Text style={formStyles.serverErr} testID="goal-server-error" accessibilityRole="alert">
            {serverError}
          </Text>
        ) : null}
        <Button title={save.isPending ? 'Guardando…' : 'Guardar meta'} onPress={submit} disabled={save.isPending} testID="save-goal" />
      </ScrollView>
      <KeyboardDoneBar keyboardHeight={keyboardHeight} />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  intro: { color: colors.muted, fontSize: 13 },
  note: { color: colors.muted, fontSize: 12 },
  formErr: { color: colors.danger, fontSize: 13 },
});
