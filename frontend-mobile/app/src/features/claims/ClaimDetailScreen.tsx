// ERD-CLAIM-01-MOBILE: detalle de un caso — lo que cuenta la persona, resumen congelado de sus datos, historial, notas, referencia y cierre.
import { CLAIM_EVENT_LABEL, CLAIM_KIND_LABEL, CLAIM_LIMITS, CLAIM_STATUS_HELP, CLAIM_STATUS_LABEL, claimEvidenceLines, fmtDop, isClaimFinished } from '@energyrd/core';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useClaim, useClaimMutations } from '../../api/hooks';
import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../components/states';
import { useSession } from '../../store/session';
import { colors, radius, spacing } from '../../theme';
import { claimErrorText, shortDate } from './model';

export function ClaimDetailScreen({ claimId }: { claimId: string }) {
  const homeId = useSession((st) => st.selectedHomeId);
  const { data, isLoading, isError, error, refetch } = useClaim(homeId, claimId);
  const m = useClaimMutations(homeId ?? '');
  const [note, setNote] = useState('');
  const [reference, setReference] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  if (!homeId) return <EmptyState icon="home-outline" title="Seleccione una vivienda" />;
  if (isLoading) return <LoadingSkeleton label="Cargando el caso…" count={2} />;
  if (isError || !data) return <ErrorState error={error} onRetry={() => void refetch()} />;
  const done = (clear?: () => void) => ({ onSuccess: () => { clear?.(); setMessage(null); void refetch(); }, onError: (e: unknown) => setMessage(claimErrorText(e)) });
  const finished = isClaimFinished(data.status);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <Text style={s.h1} accessibilityRole="header">{data.subject}</Text>
        <Text style={s.muted} testID="claim-status">{CLAIM_KIND_LABEL[data.kind]} · {CLAIM_STATUS_LABEL[data.status]}</Text>
        <Text style={s.muted}>{CLAIM_STATUS_HELP[data.status]}</Text>
        {message ? <Text style={s.error} accessibilityRole="alert">{message}</Text> : null}
        <View style={s.card}>
          <Text style={s.h2} accessibilityRole="header">Lo que cuentas</Text>
          <Text style={s.body}>{data.description}</Text>
          {data.disputed_amount_dop ? <Text style={s.muted}>Monto en duda: {fmtDop(data.disputed_amount_dop)}</Text> : null}
          <Text style={s.muted} testID="claim-reference-value">Número de referencia de la distribuidora: {data.reference_number ?? 'aún sin registrar'}</Text>
        </View>
        {data.evidence ? (
          <View style={s.card}>
            <Text style={s.h2} accessibilityRole="header">Resumen de tus datos</Text>
            {claimEvidenceLines(data.evidence).map((l) => (
              <View key={l.label} style={s.line} accessible accessibilityLabel={`${l.label}: ${l.value}`}>
                <Text style={[s.muted, { flex: 1 }]}>{l.label}</Text>
                <Text style={s.value}>{l.value}</Text>
              </View>
            ))}
            <Text style={s.muted}>{data.evidence.note}</Text>
            <Text style={s.muted}>Captado el {shortDate(data.evidence.captured_at)}. No cambia aunque edites la factura después.</Text>
          </View>
        ) : null}
        <View style={s.card}>
          <Text style={s.h2} accessibilityRole="header">Historial</Text>
          {data.events.map((e) => (
            <View key={e.id} style={{ gap: 2 }}>
              <Text style={s.body}>{CLAIM_EVENT_LABEL(e.kind, e.status_to)} <Text style={s.muted}>· {shortDate(e.created_at)}</Text></Text>
              {e.note ? <Text style={s.muted}>{e.note}</Text> : null}
            </View>
          ))}
        </View>
        {!finished ? (
          <View style={{ gap: spacing.md }}>
            <Field label="Agregar una nota" testID="claim-note" value={note} multiline maxLength={CLAIM_LIMITS.noteMax} onChangeText={setNote} style={{ minHeight: 80, textAlignVertical: 'top' }} />
            <Button title="Guardar nota" variant="secondary" loading={m.note.isPending} testID="claim-note-save" disabled={note.trim().length < CLAIM_LIMITS.noteMin}
              onPress={() => m.note.mutate({ id: claimId, note: note.trim() }, done(() => setNote('')))} />
            <Field label="Número de referencia de la distribuidora" testID="claim-ref-input" value={reference} maxLength={CLAIM_LIMITS.referenceMax} onChangeText={setReference} />
            <Button title="Guardar número" variant="secondary" loading={m.reference.isPending} testID="claim-ref-save" disabled={!reference.trim()}
              onPress={() => m.reference.mutate({ id: claimId, reference: reference.trim() }, done(() => setReference('')))} />
            <Button title="Cerrar caso" variant="danger" loading={m.close.isPending} testID="claim-close"
              onPress={() => Alert.alert('Cerrar caso', '¿Cerrar este caso? Ya no podrás agregar notas.', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Cerrar caso', style: 'destructive', onPress: () => m.close.mutate({ id: claimId }, done()) }])} />
          </View>
        ) : null}
        <Text style={s.muted}>{data.disclaimer}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md },
  h1: { color: colors.text, fontSize: 20, fontWeight: '700' },
  h2: { color: colors.text, fontSize: 16, fontWeight: '700' },
  body: { color: colors.text, fontSize: 15, lineHeight: 22 },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  value: { color: colors.text, fontSize: 14, fontWeight: '600', textAlign: 'right', maxWidth: '55%' },
  line: { flexDirection: 'row', gap: spacing.md },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  error: { color: colors.danger, backgroundColor: colors.dangerBg, borderRadius: radius.sm, padding: spacing.sm, fontSize: 14 },
});
