import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import type { BillImage } from '@energyrd/api-client';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError } from '../../api/client';
import { OCR_SLOW_AFTER_MS, useBillOcr, useCreateBill } from '../../api/hooks';
import { Button, EmptyView } from '../../components/ui';
import { colors, spacing } from '../../theme';
import { useSession } from '../../store/session';
import { describeError } from '../../api/errors';
import { canRetryOcr, confidenceText, draftToFormValues, ocrErrorText, ocrJobBillInput, ocrPhase, ocrSourceText } from './ocrModel';
import type { BillFormValues } from './form';

type PickFile = () => Promise<BillImage | null>;

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

/** ERD-OCR-PROD: las facturas electrónicas de la distribuidora suelen ser PDF. */
async function pickBillPdf(): Promise<BillImage | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: false });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, name: asset.name ?? 'factura.pdf', type: 'application/pdf' };
}

const pickBillFromLibrary: PickFile = () => pickBillImage('library');
const takeBillPhoto: PickFile = () => pickBillImage('camera');

/** Seam override for pure tests; production uses Expo camera/gallery pickers. */
export const unavailableImagePicker: PickFile = pickBillFromLibrary;

function Field({ label, value, onChangeText, confidence, testID }: { label: string; value: string; onChangeText: (text: string) => void; confidence?: string; testID: string }) {
  return <View style={s.field}>
    <View style={s.labelRow}><Text style={s.label}>{label}</Text>{confidence ? <Text style={s.confidence}>{confidence}</Text> : null}</View>
    <TextInput value={value} onChangeText={onChangeText} testID={testID} accessibilityLabel={label} style={s.input} placeholderTextColor={colors.muted} />
  </View>;
}

export function BillOcrScreen({ onManual, onDone, pickImage = unavailableImagePicker }: { onManual: () => void; onDone: () => void; pickImage?: PickFile }) {
  const homeId = useSession((state) => state.selectedHomeId);
  const create = useCreateBill(homeId ?? '');
  const ocr = useBillOcr(homeId);
  const [values, setValues] = useState<BillFormValues | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const job = ocr.job;
  const busy = ocr.start.isPending || ocr.retry.isPending;
  const phase = ocrPhase(job, busy, ocr.startedAt ? now - ocr.startedAt : 0, OCR_SLOW_AFTER_MS);

  // El borrador editable se arma una sola vez cuando el trabajo termina.
  useEffect(() => {
    if (job?.status === 'done' && job.draft) setValues((current) => current ?? draftToFormValues(job.draft!));
    if (job?.status !== 'done') setValues(null);
  }, [job?.status, job?.draft]);
  // Reloj lento solo mientras se espera: sirve para avisar «tarda más de lo normal».
  useEffect(() => {
    if (phase !== 'working' && phase !== 'slow') return;
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, [phase]);

  if (!homeId) return <EmptyView title="Seleccione una vivienda" hint="Elija una vivienda antes de leer una factura." />;

  const choose = async (pick: PickFile) => {
    setError(null);
    const file = await pick();
    if (!file) { setError('No se seleccionó ningún archivo. Puede ingresar la factura manualmente.'); return; }
    ocr.reset();
    setNow(Date.now());
    ocr.start.mutate(file, { onError: (e) => setError(e instanceof ApiError ? describeError(e).message : 'No se pudo enviar la factura. Intente de nuevo.') });
  };

  const update = (key: keyof BillFormValues) => (text: string) => setValues((current) => current ? { ...current, [key]: text } : current);
  const confirm = () => {
    if (!values || !job) return;
    setError(null);
    try {
      create.mutate(ocrJobBillInput(values, job.document_id), { onSuccess: onDone, onError: (e) => setError(e instanceof ApiError ? describeError(e).message : 'No se pudo guardar la factura.') });
    } catch (e) { setError(e instanceof Error ? e.message : 'Revise los campos indicados.'); }
  };

  if (phase !== 'done' || !job?.draft || !values) {
    const working = phase === 'working' || phase === 'slow';
    return <ScrollView contentContainerStyle={s.container}>
      <Text style={s.title}>Leer factura desde una foto o PDF</Text>
      <Text style={s.note}>La lectura automática genera un borrador. Revise todos los campos antes de confirmar; no se guarda ninguna factura durante la lectura. El archivo se guarda cifrado y se asocia a la factura que confirme; si no la confirma, se elimina automáticamente.</Text>
      {working ? <View accessible accessibilityLiveRegion="polite" accessibilityRole="progressbar" accessibilityLabel="Analizando la factura" testID="ocr-working">
        <Text style={s.working}>Analizando su factura… puede tardar unos segundos. No cierre esta pantalla.</Text>
        {phase === 'slow' ? <Text style={s.warning} testID="ocr-slow">Está tardando más de lo normal. Puede seguir esperando o ingresar la factura manualmente.</Text> : null}
      </View> : null}
      {phase === 'failed' && job ? <View accessibilityRole="alert" testID="ocr-failed">
        <Text style={s.error}>{ocrErrorText(job.error_code)}</Text>
        {canRetryOcr(job) ? <Button title={ocr.retry.isPending ? 'Reintentando…' : 'Reintentar'} onPress={() => ocr.retry.mutate()} disabled={ocr.retry.isPending} testID="retry-ocr" /> : null}
      </View> : null}
      {error ? <Text style={s.error} accessibilityRole="alert" testID="ocr-error">{error}</Text> : null}
      <Button title="Tomar foto" onPress={() => choose(takeBillPhoto)} disabled={working} testID="take-bill-photo" />
      <Button title="Seleccionar foto" onPress={() => choose(pickBillFromLibrary)} disabled={working} testID="select-bill-photo" />
      <Button title="Seleccionar PDF" onPress={() => choose(pickBillPdf)} disabled={working} testID="select-bill-pdf" />
      <Button title="Ingresar factura manualmente" onPress={onManual} variant="secondary" testID="manual-bill-alternative" />
    </ScrollView>;
  }

  const draft = job.draft;
  const field = (key: 'period_start' | 'period_end' | 'days' | 'kwh' | 'amount_dop' | 'reading_previous' | 'reading_current' | 'due_date', formKey: keyof BillFormValues, label: string, testID: string) => <Field label={label} value={values[formKey]} onChangeText={update(formKey)} confidence={confidenceText(draft[key].confidence)} testID={testID} />;
  return <ScrollView contentContainerStyle={s.container}>
    <Text style={s.title}>Revisar borrador de factura</Text>
    <Text style={s.note}>La lectura es solo un borrador. Corrija lo necesario y confirme explícitamente para crear la factura. {ocrSourceText(job)}</Text>
    {draft.warnings.map((warning) => <Text key={warning} style={s.warning} accessibilityRole="alert">⚠ {warning}</Text>)}
    {field('period_start', 'periodStart', 'Inicio del período (AAAA-MM-DD)', 'ocr-start')}
    {field('period_end', 'periodEnd', 'Fin del período (AAAA-MM-DD)', 'ocr-end')}
    {field('days', 'days', 'Días', 'ocr-days')}
    {field('kwh', 'kwh', 'Consumo (kWh)', 'ocr-kwh')}
    {field('amount_dop', 'amount', 'Monto total (RD$)', 'ocr-amount')}
    {field('reading_previous', 'readingPrevious', 'Lectura anterior (opcional)', 'ocr-rprev')}
    {field('reading_current', 'readingCurrent', 'Lectura actual (opcional)', 'ocr-rcurr')}
    {field('due_date', 'dueDate', 'Fecha límite de pago (opcional)', 'ocr-due')}
    <Text style={s.raw}>Texto detectado: {draft.raw_text_excerpt || 'Sin texto'}</Text>
    {error ? <Text style={s.error} accessibilityRole="alert" testID="ocr-error">{error}</Text> : null}
    <Button title={create.isPending ? 'Guardando…' : 'Confirmar y guardar factura'} onPress={confirm} disabled={create.isPending} testID="confirm-ocr-bill" />
  </ScrollView>;
}

const s = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, backgroundColor: colors.bg },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  note: { color: colors.muted, lineHeight: 21 },
  working: { color: colors.text, lineHeight: 21 },
  field: { gap: 4 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  label: { color: colors.text, fontWeight: '600', fontSize: 13 },
  confidence: { color: colors.muted, fontSize: 12 },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: spacing.md, fontSize: 16, color: colors.text },
  warning: { color: colors.text, backgroundColor: colors.warningBg, padding: spacing.md, borderRadius: 10 },
  error: { color: colors.danger, backgroundColor: colors.dangerBg, padding: spacing.md, borderRadius: 10 },
  raw: { color: colors.muted, fontSize: 12, lineHeight: 18 },
});
