import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Field, formStyles } from '../../../components/Field';
import { KeyboardDoneBar, useKeyboardHeight } from '../../../components/KeyboardDoneBar';
import { Segmented } from '../../../components/Segmented';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../../components/states';
import { Button, TextAction } from '../../../components/ui';
import { useSession } from '../../../store/session';
import { colors, radius, spacing } from '../../../theme';
import { useBillItems, useSaveBillItems } from './hooks';
import { MAX_ITEMS, canAddItem, draftsFromItems, newDraft, validateItems, type ItemDraft, type ItemErrors, type ItemKind } from './itemsForm';
import { saveItemsErrorMessage } from './saveItems';
import { belongsToSelectedHome, detailScreenState } from './screenState';

const KINDS = [{ key: 'charge', label: 'Cargo' }, { key: 'discount', label: 'Descuento' }] as const;

/** Editor de cargos/descuentos: reemplazo completo (PUT) confirmado con GET antes de mostrar éxito. */
export function BillItemsEditorScreen({ homeId: routeHomeId, billId, onSaved }: { homeId: string; billId: string; onSaved: () => void }) {
  const selected = useSession((st) => st.selectedHomeId);
  const homeId = belongsToSelectedHome(selected, routeHomeId) ? routeHomeId : null;
  const items = useBillItems(homeId, billId);
  const save = useSaveBillItems(homeId ?? '', billId);
  const [drafts, setDrafts] = useState<ItemDraft[] | null>(null);
  const [errors, setErrors] = useState<ItemErrors>({});
  const [listError, setListError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const keyboardHeight = useKeyboardHeight();

  // Precarga una sola vez desde lo guardado; luego el borrador es del usuario.
  useEffect(() => {
    if (drafts === null && items.data) setDrafts(draftsFromItems(items.data.items));
  }, [drafts, items.data]);

  if (!homeId) return <EmptyState icon="home-outline" title="Factura de otra vivienda" hint="Cambió la vivienda activa; no se guardó nada." testID="items-other-home" />;
  const state = detailScreenState({ isLoading: items.isLoading, error: items.error, hasData: !!items.data });
  if (state.kind === 'loading' || (state.kind === 'ready' && drafts === null)) return <LoadingSkeleton label="Cargando detalle…" />;
  if (state.kind === 'unavailable')
    return <EmptyState icon="information-circle-outline" title="No disponible" hint="El detalle de factura no está disponible en este servidor." testID="items-unavailable" />;
  if (state.kind === 'error' || drafts === null) return <ErrorState error={items.error} onRetry={() => void items.refetch()} />;

  const update = (id: string, patch: Partial<ItemDraft>) => setDrafts((list) => (list ?? []).map((d) => (d.id === id ? { ...d, ...patch } : d)));
  const remove = (id: string) => setDrafts((list) => (list ?? []).filter((d) => d.id !== id));
  const add = () => setDrafts((list) => (list && canAddItem(list) ? [...list, newDraft()] : list));

  const submit = () => {
    setServerError(null);
    const result = validateItems(drafts);
    setErrors(result.errors);
    setListError(result.listError);
    if (!result.input) return;
    save.mutate(result.input, {
      onSuccess: onSaved,
      onError: (e) => setServerError(saveItemsErrorMessage(e)),
    });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
        <Text style={s.intro}>
          Copie los cargos y descuentos de su factura. Escriba los montos sin signo: el tipo indica si suman o restan.
          El total de la factura no cambia.
        </Text>
        {drafts.length === 0 ? <Text style={s.intro} testID="items-empty">Sin ítems. Guardar sin ítems deja la factura sin detalle.</Text> : null}
        {drafts.map((d, i) => (
          <View key={d.id} style={s.card} testID={`item-${i}`}>
            <Field label={`Concepto ${i + 1}`} testID={`item-label-${i}`} value={d.label} onChangeText={(t) => update(d.id, { label: t })} error={errors[d.id]?.label} placeholder="Ej.: Cargo fijo" />
            <Segmented<ItemKind> label={`Tipo del concepto ${i + 1}`} options={KINDS} value={d.kind} onChange={(kind) => update(d.id, { kind })} testIDPrefix={`item-kind-${i}`} />
            <Field label="Monto (RD$, sin signo)" testID={`item-amount-${i}`} value={d.amount} onChangeText={(t) => update(d.id, { amount: t })} error={errors[d.id]?.amount} keyboardType="decimal-pad" placeholder="1,250.00" />
            <View style={{ alignItems: 'flex-end' }}>
              <TextAction title="Quitar" tone="danger" onPress={() => remove(d.id)} testID={`item-remove-${i}`} accessibilityLabel={`Quitar el concepto ${i + 1}`} />
            </View>
          </View>
        ))}
        <Button title="Añadir ítem" variant="secondary" onPress={add} disabled={!canAddItem(drafts)} testID="items-add" />
        <Text style={s.intro}>{drafts.length} de {MAX_ITEMS} ítems como máximo.</Text>
        {listError ? <Text style={formStyles.serverErr} testID="items-list-error" accessibilityRole="alert">{listError}</Text> : null}
        {serverError ? <Text style={formStyles.serverErr} testID="items-server-error" accessibilityRole="alert">{serverError}</Text> : null}
        <Button title={save.isPending ? 'Guardando y confirmando…' : 'Guardar detalle'} onPress={submit} disabled={save.isPending} testID="items-save" />
      </ScrollView>
      <KeyboardDoneBar keyboardHeight={keyboardHeight} />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  intro: { color: colors.muted, fontSize: 13 },
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
});
