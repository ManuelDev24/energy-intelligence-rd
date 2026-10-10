import * as ImagePicker from 'expo-image-picker';
import type { BillImage } from '@energyrd/api-client';
import type { OcrDraft } from '@energyrd/api-contracts';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError, api } from '../../api/client';
import { useCreateBill } from '../../api/hooks';
import { Button, EmptyView } from '../../components/ui';
import { colors, spacing } from '../../theme';
import { useSession } from '../../store/session';
import { describeError } from '../../api/errors';
import { draftToFormValues, ocrDraftToBillInput, confidenceText } from './ocrModel';
import type { BillFormValues } from './form';

type PickImage = () => Promise<BillImage | null>;

async function pickBillImage(source: 'library' | 'camera'): Promise<BillImage | null> {
  const permission = source === 'camera'
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;
  const result = source === 'camera'
    ? await ImagePicker.launchCameraAsync({ quality: 0.9, allowsEditing: false })
    : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, allowsEditing: false });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, name: asset.fileName ?? 'factura.jpg', type: asset.mimeType ?? 'image/jpeg' };
}

async function pickBillFromLibrary() { return pickBillImage('library'); }
async function takeBillPhoto() { return pickBillImage('camera'); }

/** Seam override for pure tests; production uses Expo camera/gallery pickers. */
export const unavailableImagePicker: PickImage = pickBillFromLibrary;

function Field({ label, value, onChangeText, confidence, testID }: { label: string; value: string; onChangeText: (text: string) => void; confidence?: string; testID: string }) {
  return <View style={s.field}>
    <View style={s.labelRow}><Text style={s.label}>{label}</Text>{confidence ? <Text style={s.confidence}>{confidence}</Text> : null}</View>
    <TextInput value={value} onChangeText={onChangeText} testID={testID} accessibilityLabel={label} style={s.input} placeholderTextColor={colors.muted} />
  </View>;
}

export function BillOcrScreen({ onManual, onDone, pickImage = unavailableImagePicker }: { onManual: () => void; onDone: () => void; pickImage?: PickImage }) {
  const homeId = useSession((state) => state.selectedHomeId);
  const create = useCreateBill(homeId ?? '');
  const [draft, setDraft] = useState<OcrDraft | null>(null);
  const [values, setValues] = useState<BillFormValues | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!homeId) return <EmptyView title="Seleccione una vivienda" hint="Elija una vivienda antes de leer una factura." />;

  const choose = async (pick: PickImage) => {
    setError(null);
    const image = await pick();
    if (!image) { setError('La selección de fotos no está disponible en esta instalación. Puede ingresar la factura manualmente.'); return; }
    setBusy(true);
    try { const result = await api.ocrBill(homeId, image); setDraft(result); setValues(draftToFormValues(result)); }
    catch (e) { setError(e instanceof ApiError ? describeError(e).message : 'No se pudo leer la factura. Intente de nuevo.'); }
    finally { setBusy(false); }
  };

  const update = (key: keyof BillFormValues) => (text: string) => setValues((current) => current ? { ...current, [key]: text } : current);
  const confirm = () => {
    if (!values) return;
    setError(null);
    try {
      create.mutate(ocrDraftToBillInput(values), { onSuccess: onDone, onError: (e) => setError(e instanceof ApiError ? describeError(e).message : 'No se pudo guardar la factura.') });
    } catch (e) { setError(e instanceof Error ? e.message : 'Revise los campos indicados.'); }
  };

  if (!draft || !values) return <ScrollView contentContainerStyle={s.container}>
    <Text style={s.title}>Leer factura desde una foto</Text>
    <Text style={s.note}>La lectura automática genera un borrador. Revise todos los campos antes de confirmar; no se guarda ninguna factura durante la lectura.</Text>
    {error ? <Text style={s.error} accessibilityRole="alert" testID="ocr-error">{error}</Text> : null}
    <Button title={busy ? 'Leyendo…' : 'Tomar foto'} onPress={() => choose(takeBillPhoto)} disabled={busy} testID="take-bill-photo" />
    <Button title={busy ? 'Leyendo…' : 'Seleccionar foto'} onPress={() => choose(pickBillFromLibrary)} disabled={busy} testID="select-bill-photo" />
    <Button title="Ingresar factura manualmente" onPress={onManual} variant="secondary" testID="manual-bill-alternative" />
  </ScrollView>;

  const field = (key: 'period_start' | 'period_end' | 'days' | 'kwh' | 'amount_dop' | 'reading_previous' | 'reading_current', formKey: keyof BillFormValues, label: string, testID: string) => <Field label={label} value={values[formKey]} onChangeText={update(formKey)} confidence={confidenceText(draft[key].confidence)} testID={testID} />;
  return <ScrollView contentContainerStyle={s.container}>
    <Text style={s.title}>Revisar borrador de factura</Text>
    <Text style={s.note}>OCR es solo un borrador. Corrija lo necesario y confirme explícitamente para crear la factura.</Text>
    {draft.warnings.map((warning) => <Text key={warning} style={s.warning} accessibilityRole="alert">⚠ {warning}</Text>)}
    {field('period_start', 'periodStart', 'Inicio del período (AAAA-MM-DD)', 'ocr-start')}
    {field('period_end', 'periodEnd', 'Fin del período (AAAA-MM-DD)', 'ocr-end')}
    {field('days', 'days', 'Días', 'ocr-days')}
    {field('kwh', 'kwh', 'Consumo (kWh)', 'ocr-kwh')}
    {field('amount_dop', 'amount', 'Monto total (RD$)', 'ocr-amount')}
    {field('reading_previous', 'readingPrevious', 'Lectura anterior (opcional)', 'ocr-rprev')}
    {field('reading_current', 'readingCurrent', 'Lectura actual (opcional)', 'ocr-rcurr')}
    <Text style={s.raw}>Texto detectado: {draft.raw_text_excerpt || 'Sin texto'}</Text>
    {error ? <Text style={s.error} accessibilityRole="alert" testID="ocr-error">{error}</Text> : null}
    <Button title={create.isPending ? 'Guardando…' : 'Confirmar y guardar factura'} onPress={confirm} disabled={create.isPending} testID="confirm-ocr-bill" />
  </ScrollView>;
}

const s = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, backgroundColor: colors.bg },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  note: { color: colors.muted, lineHeight: 21 },
  field: { gap: 4 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  label: { color: colors.text, fontWeight: '600', fontSize: 13 },
  confidence: { color: colors.muted, fontSize: 12 },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: spacing.md, fontSize: 16, color: colors.text },
  warning: { color: colors.text, backgroundColor: colors.warningBg, padding: spacing.md, borderRadius: 10 },
  error: { color: colors.danger, backgroundColor: colors.dangerBg, padding: spacing.md, borderRadius: 10 },
  raw: { color: colors.muted, fontSize: 12, lineHeight: 18 },
});
