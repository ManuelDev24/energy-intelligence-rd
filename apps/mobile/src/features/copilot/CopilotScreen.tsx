// ERD-AI-CHAT-MOBILE / SOURCES / SAFETY: chat del Energy Copilot. Streaming SSE, detener/reintentar, historial de conversaciones,
// fuentes con calidad del dato, valoración y Markdown seguro. Solo lee datos de la vivienda activa; el texto de error siempre es local.
import Ionicons from '@expo/vector-icons/Ionicons';
import { copilotQuickActions, todayRD } from '@energyrd/core';
import type { CopilotMessageOut } from '@energyrd/api-contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useReducer, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { copilotKeys } from '../../api/hooks';
import { BottomSheet } from '../../components/BottomSheet';
import { Button, TextAction } from '../../components/Button';
import { QualityBadge } from '../../components/DataStatusBadge';
import { Field } from '../../components/Field';
import { EmptyState, ErrorState, LoadingSkeleton } from '../../components/states';
import { Segmented } from '../../components/Segmented';
import { useSession } from '../../store/session';
import { colors, radius, spacing, TOUCH } from '../../theme';
import { CopilotMarkdown } from './CopilotMarkdown';
import { useConversationMessages, useConversationMutations, useConversations, useCopilotUsage } from './hooks';
import { copilotErrorText, linkTarget, messageStatusNote, periodFor, periodIsValid, PERIODS, showPendingQuestion, sourceSummary, streamReducer, type LinkTarget, type PeriodKey } from './model';
import { sendCopilotTurn } from './transport';

export type CopilotNav = { onLink?: (target: LinkTarget) => void };

function Bubble({ who, children }: { who: 'Tú' | 'Copilot'; children: React.ReactNode }) {
  return (
    <View style={[s.bubble, who === 'Tú' ? s.mine : s.theirs]} accessible={false}>
      <Text style={s.who}>{who}</Text>
      {children}
    </View>
  );
}

function Assistant({ message, onLink, onFeedback, pending }: { message: CopilotMessageOut; onLink: (href: string) => void; onFeedback: (value: 1 | -1 | null) => void; pending: boolean }) {
  const [open, setOpen] = useState(false);
  const note = messageStatusNote(message.status);
  return (
    <Bubble who="Copilot">
      {message.content ? <CopilotMarkdown text={message.content} onLink={onLink} /> : null}
      {note ? <Text style={s.note}>{note}</Text> : null}
      {message.sources.length ? (
        <View style={{ gap: 4 }}>
          <TextAction title={`${open ? 'Ocultar' : 'Ver'} fuentes consultadas (${message.sources.length})`} onPress={() => setOpen((v) => !v)} testID={`sources-${message.id}`} />
          {open ? message.sources.map((src, i) => {
            const internal = src.href ? linkTarget(src.href) : null;
            return (
              <View key={`${src.kind}-${i}`} style={s.source} accessible accessibilityLabel={sourceSummary(src)}>
                {internal && src.href ? <Text style={s.link} accessibilityRole="link" onPress={() => onLink(src.href as string)}>{src.label}</Text> : <Text style={s.body}>{src.label}</Text>}
                <QualityBadge quality={src.quality} always />
              </View>
            );
          }) : null}
        </View>
      ) : null}
      {message.status === 'complete' ? (
        <View style={s.row} accessibilityRole="toolbar" accessibilityLabel="¿Te sirvió esta respuesta?">
          {([[1, 'thumbs-up', 'Útil'], [-1, 'thumbs-down', 'No útil']] as const).map(([value, icon, label]) => (
            <Pressable key={value} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: message.feedback === value, disabled: pending }} disabled={pending}
              testID={`feedback-${value}-${message.id}`} onPress={() => onFeedback(message.feedback === value ? null : value)} style={s.icon} hitSlop={4}>
              <Ionicons name={message.feedback === value ? icon : (`${icon}-outline` as 'thumbs-up-outline')} size={20} color={colors.primary} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </Bubble>
  );
}

export function CopilotScreen({ onLink }: CopilotNav = {}) {
  const homeId = useSession((st) => st.selectedHomeId);
  const home = homeId ?? '';
  const qc = useQueryClient();
  const usage = useCopilotUsage(homeId);
  const conversations = useConversations(homeId);
  const mutations = useConversationMutations(home);
  const [selected, setSelected] = useState<string | null>(null);
  const messages = useConversationMessages(homeId, selected);
  const [period, setPeriod] = useState<PeriodKey>('30');
  const [draft, setDraft] = useState('');
  const [stream, dispatch] = useReducer(streamReducer, { phase: 'idle' });
  const [pageError, setPageError] = useState<string | null>(null);
  const [history, setHistory] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const scroller = useRef<ScrollView>(null);
  const today = todayRD();
  const range = periodFor(period, today);
  const periodOk = periodIsValid(range.from, range.to, today);

  useEffect(() => () => controller.current?.abort(), []);
  // Cambiar de vivienda o de cuenta corta la respuesta en curso y vuelve a un chat vacío: nada de otra vivienda queda en pantalla.
  useEffect(() => { controller.current?.abort(); setSelected(null); dispatch({ type: 'reset' }); setPageError(null); }, [homeId]);
  useEffect(() => {
    if (selected && !conversations.isFetching && conversations.data && !conversations.data.some((c) => c.id === selected)) setSelected(null);
  }, [conversations.data, conversations.isFetching, selected]);

  const busy = stream.phase === 'streaming';
  const limited = usage.data?.limited ?? false;
  const disabled = usage.data ? !usage.data.enabled : false;
  const canSend = !!homeId && !busy && !limited && !disabled && periodOk;
  const rows = messages.data ?? [];

  const open = (href: string) => { const target = linkTarget(href); if (target) onLink?.(target); };

  async function send(question: string) {
    const content = question.trim();
    if (!content || !canSend || !homeId) return;
    setPageError(null);
    let conversationId = selected;
    try {
      if (!conversationId) { conversationId = (await mutations.create.mutateAsync(undefined)).id; setSelected(conversationId); }
    } catch (error) { setPageError(copilotErrorText(error)); return; }
    const abort = new AbortController();
    controller.current = abort;
    setDraft('');
    dispatch({ type: 'start', question: content });
    try {
      await sendCopilotTurn(homeId, conversationId, { content, period_from: range.from, period_to: range.to }, (event) => dispatch({ type: 'event', event }), abort.signal);
      dispatch({ type: 'ended' });
    } catch (error) {
      if (abort.signal.aborted) dispatch({ type: 'cancelled' });
      else dispatch({ type: 'failed', message: copilotErrorText(error) });
    } finally {
      if (controller.current === abort) controller.current = null;
      // La API guarda pregunta y respuesta (también si se cancela): se relee el historial y el uso.
      setTimeout(() => { void qc.invalidateQueries({ queryKey: copilotKeys.root(homeId) }); }, 300);
    }
  }

  if (!homeId) return <EmptyState icon="home-outline" title="Seleccione una vivienda" hint="El Copilot responde con los datos de la vivienda activa." />;

  if (history) {
    return (
      <View style={s.screen} testID="copilot-history">
        <View style={s.bar}>
          <TextAction title="Volver al chat" onPress={() => setHistory(false)} testID="copilot-back" />
        </View>
        {conversations.isLoading ? <LoadingSkeleton label="Cargando conversaciones…" count={3} /> : conversations.isError ? <ErrorState error={conversations.error} onRetry={() => void conversations.refetch()} />
          : (
            <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
              {conversations.data?.length ? conversations.data.map((c) => (
                <View key={c.id} style={[s.convo, c.id === selected && s.convoOn]}>
                  <Pressable style={{ flex: 1, minHeight: TOUCH, justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={`Abrir conversación: ${c.title}`} accessibilityState={{ selected: c.id === selected }}
                    testID={`convo-${c.id}`} onPress={() => { setSelected(c.id); dispatch({ type: 'reset' }); setHistory(false); }}>
                    <Text style={s.body} numberOfLines={2}>{c.title}</Text>
                  </Pressable>
                  <TextAction title="Renombrar" accessibilityLabel={`Renombrar «${c.title}»`} onPress={() => setRenaming({ id: c.id, title: c.title })} testID={`rename-${c.id}`} />
                  <TextAction title="Borrar" tone="danger" accessibilityLabel={`Borrar «${c.title}»`} testID={`delete-${c.id}`} onPress={() => Alert.alert('Borrar conversación', `Se borrará «${c.title}» con todos sus mensajes. No se puede deshacer.`, [
                    { text: 'Cancelar', style: 'cancel' },
                    { text: 'Borrar', style: 'destructive', onPress: () => {
                      mutations.remove.mutate(c.id, {
                        onSuccess: () => { if (selected === c.id) { setSelected(null); dispatch({ type: 'reset' }); } },
                        onError: (error) => setPageError(copilotErrorText(error)),
                      });
                    } },
                  ])} />
                </View>
              )) : <EmptyState icon="chatbubbles-outline" title="Aún no tienes conversaciones" hint="Haz una pregunta en el chat y aparecerá aquí." compact />}
              {pageError ? <Text style={s.error} accessibilityRole="alert">{pageError}</Text> : null}
            </ScrollView>
          )}
        <BottomSheet visible={!!renaming} title="Renombrar conversación" onClose={() => setRenaming(null)} dismissible={!mutations.rename.isPending}>
          <Field label="Nuevo título" testID="rename-input" value={renaming?.title ?? ''} maxLength={120} onChangeText={(title) => setRenaming((r) => (r ? { ...r, title } : r))} />
          {mutations.rename.isError ? <Text style={s.error} accessibilityRole="alert">No se pudo renombrar.</Text> : null}
          <Button title="Guardar" loading={mutations.rename.isPending} disabled={!renaming?.title.trim()} testID="rename-save" onPress={() => {
            if (!renaming) return;
            mutations.rename.mutate({ id: renaming.id, title: renaming.title.trim() }, { onSuccess: () => setRenaming(null) });
          }} />
        </BottomSheet>
      </View>
    );
  }

  const actions = copilotQuickActions(periodOk ? range : null);
  const showStream = stream.phase !== 'idle';
  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <View style={s.bar}>
        <TextAction title="Historial" onPress={() => setHistory(true)} testID="copilot-history-open" />
        <TextAction title="Nueva conversación" onPress={() => { if (!busy) { setSelected(null); dispatch({ type: 'reset' }); } }} testID="copilot-new" />
      </View>
      <ScrollView ref={scroller} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, flexGrow: 1 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets
        onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}>
        <Text style={s.muted}>
          Responde solo con los datos registrados de tu vivienda e indica su calidad; si falta algo, te dice qué registrar. No cambia tus datos.
          {usage.data ? ` Hoy: ${usage.data.messages_used} de ${usage.data.messages_limit} preguntas.` : ''}
        </Text>
        {disabled ? <Text style={s.notice} accessibilityRole="alert">El Copilot no está disponible en este entorno por ahora.</Text> : null}
        {limited ? <Text style={s.notice} accessibilityRole="alert">Alcanzaste el límite diario del Copilot. Vuelve a intentarlo mañana.</Text> : null}
        {pageError ? <Text style={s.error} accessibilityRole="alert">{pageError}</Text> : null}

        {selected ? (
          messages.isLoading ? <LoadingSkeleton label="Cargando mensajes…" count={2} /> : messages.isError ? <ErrorState error={messages.error} onRetry={() => void messages.refetch()} />
            : rows.map((m) => m.role === 'user' ? <Bubble key={m.id} who="Tú"><Text style={s.body}>{m.content}</Text></Bubble>
              : <Assistant key={m.id} message={m} onLink={open} pending={mutations.feedback.isPending}
                  onFeedback={(value) => mutations.feedback.mutate({ conversationId: m.conversation_id, messageId: m.id, value })} />)
        ) : !showStream ? <EmptyState icon="sparkles-outline" title="¿En qué te ayudo?" hint="Elige una pregunta rápida o escribe la tuya. Usaré la vivienda y el período seleccionados." compact /> : null}

        {showStream ? (
          <>
            {showPendingQuestion(rows, stream.question) ? <Bubble who="Tú"><Text style={s.body}>{stream.question}</Text></Bubble> : null}
            <Bubble who="Copilot">
              <View accessibilityLiveRegion="polite">
                {stream.tool ? <Text style={s.muted}>{stream.tool}…</Text> : null}
                {busy && !stream.text && !stream.tool ? <Text style={s.muted}>Pensando…</Text> : null}
              </View>
              {stream.text ? <CopilotMarkdown text={stream.text} onLink={open} /> : null}
              {stream.phase === 'cancelled' ? <Text style={s.note}>Respuesta cancelada.</Text> : null}
              {stream.phase === 'refused' || stream.phase === 'error' ? <Text style={s.error} accessibilityRole="alert">{stream.message}</Text> : null}
              {busy ? <Button title="Detener respuesta" variant="secondary" onPress={() => controller.current?.abort()} testID="copilot-stop" />
                : stream.phase === 'cancelled' || stream.phase === 'error' ? <Button title="Reintentar" variant="secondary" disabled={!canSend} onPress={() => void send(stream.question)} testID="copilot-retry" /> : null}
            </Bubble>
          </>
        ) : null}
      </ScrollView>

      {!disabled ? (
        <View style={s.composer}>
          <Segmented label="Período" options={PERIODS.map(({ key, label }) => ({ key, label }))} value={period} onChange={setPeriod} testIDPrefix="copilot-period" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" accessibilityLabel="Preguntas rápidas" contentContainerStyle={{ gap: spacing.sm }}>
            {actions.map((a) => (
              <Pressable key={a.id} accessibilityRole="button" accessibilityLabel={a.label} accessibilityState={{ disabled: !canSend }} disabled={!canSend} testID={`quick-${a.id}`}
                onPress={() => void send(a.prompt)} style={[s.chip, !canSend && { opacity: 0.5 }]}>
                <Text style={s.chipText}>{a.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={s.inputRow}>
            <TextInput value={draft} onChangeText={setDraft} multiline maxLength={4000} editable={!busy && !limited} accessibilityLabel="Tu pregunta" testID="copilot-input"
              placeholder="Por ejemplo: ¿por qué subió mi factura?" placeholderTextColor={colors.muted} style={s.input} />
            <Pressable accessibilityRole="button" accessibilityLabel="Enviar" accessibilityState={{ disabled: !canSend || !draft.trim(), busy }} disabled={!canSend || !draft.trim()} testID="copilot-send"
              onPress={() => void send(draft)} style={[s.send, (!canSend || !draft.trim()) && { opacity: 0.5 }]}>
              <Ionicons name="send" size={20} color={colors.primaryText} />
            </Pressable>
          </View>
          <Text style={s.muted}>Las respuestas pueden contener errores: revisa las fuentes.{draft.length > 3500 ? ` ${draft.length}/4000` : ''}</Text>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  bar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card },
  body: { color: colors.text, fontSize: 15, lineHeight: 22 },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  note: { color: colors.muted, fontSize: 14 },
  link: { color: colors.primary, textDecorationLine: 'underline', fontSize: 15 },
  error: { color: colors.danger, backgroundColor: colors.dangerBg, borderRadius: radius.sm, padding: spacing.sm, fontSize: 14 },
  notice: { color: colors.warning, backgroundColor: colors.warningBg, borderRadius: radius.sm, padding: spacing.sm, fontSize: 14 },
  bubble: { borderRadius: radius.md, padding: spacing.md, gap: spacing.sm, borderWidth: 1 },
  mine: { backgroundColor: colors.brandSoft, borderColor: colors.brandSoft, alignSelf: 'flex-end', maxWidth: '88%' },
  theirs: { backgroundColor: colors.card, borderColor: colors.border },
  who: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  source: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, minHeight: 28 },
  row: { flexDirection: 'row', gap: spacing.xs },
  icon: { minWidth: TOUCH, minHeight: TOUCH, alignItems: 'center', justifyContent: 'center' },
  convo: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.card, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingLeft: spacing.md },
  convoOn: { borderColor: colors.primary },
  composer: { gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card },
  chip: { minHeight: TOUCH, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.full, borderWidth: 1, borderColor: colors.primary },
  chipText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  input: { flex: 1, minHeight: TOUCH, maxHeight: 120, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.text, fontSize: 16 },
  send: { width: TOUCH, height: TOUCH, borderRadius: radius.full, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
