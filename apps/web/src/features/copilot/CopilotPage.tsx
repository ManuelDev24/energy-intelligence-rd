"use client";

import { copilotQuickActions, todayRD } from "@energyrd/core";
import { MessageSquarePlus, Pencil, Sparkles, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@energyrd/api-client";
import Link from "next/link";
import { DataStatusBadge } from "@/components/data-status-badge";
import { EmptyState } from "@/components/empty-state";
import { Modal } from "@/components/modal";
import { QueryState } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { controlClass } from "@/components/ui/control";
import { Field } from "@/components/ui/field";
import { inlineLinkClass } from "@/components/ui/text-link";
import type { CopilotMessage } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/session";
import { copilotKeys, useConversationMessages, useConversationMutations, useConversations, useCopilotUsage } from "./hooks";
import { CopilotMarkdown } from "./Markdown";
import { streamCopilotTurn, type CopilotEvent } from "./stream";

type Stream =
  | { phase: "idle" }
  | { phase: "streaming" | "cancelled" | "error" | "refused"; question: string; text: string; tool: string | null; message?: string; warnings?: string[] };

const shift = (iso: string, days: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  return online;
}

function errorText(error: unknown): string {
  if (!(error instanceof ApiError)) return "No se pudo completar la solicitud.";
  if (error.code === "copilot_limit" || error.status === 429) return "Alcanzaste el límite diario del Copilot. Vuelve a intentarlo mañana.";
  if (error.code === "copilot_disabled" || error.status === 503) return "El Copilot no está disponible en este momento.";
  if (error.status === 0) return "No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.";
  if (error.status === 401) return "La sesión venció. Inicia sesión de nuevo.";
  if (error.status === 404) return "La conversación ya no existe. Elige otra o crea una nueva.";
  if (error.status === 422) return "Revisa la pregunta (máximo 4000 caracteres) y el período.";
  return "El Copilot no pudo responder ahora. Inténtalo de nuevo en unos minutos.";
}

export default function CopilotPage() {
  const { homeId } = useSession();
  const home = homeId ?? "";
  const qc = useQueryClient();
  const online = useOnline();
  const usage = useCopilotUsage(home);
  const conversations = useConversations(home);
  const mutations = useConversationMutations(home);
  const [selected, setSelected] = useState<string | null>(null);
  const messages = useConversationMessages(home, selected);
  const today = todayRD();
  const [from, setFrom] = useState(shift(today, -29));
  const [to, setTo] = useState(today);
  const [draft, setDraft] = useState("");
  const [stream, setStream] = useState<Stream>({ phase: "idle" });
  const [pageError, setPageError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; title: string } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const announce = useRef<HTMLParagraphElement>(null);
  const periodOk = from <= to && from <= today && shift(from, 366) >= to;

  useEffect(() => () => controller.current?.abort(), []);
  // Si la conversación elegida desaparece (borrada en otra pestaña), se deselecciona.
  useEffect(() => {
    if (selected && !conversations.isFetching && conversations.data && !conversations.data.some(c => c.id === selected)) setSelected(null);
  }, [conversations.data, conversations.isFetching, selected]);

  const busy = stream.phase === "streaming";
  const limited = usage.data?.limited ?? false;
  const disabled = usage.data ? !usage.data.enabled : false;
  const canSend = online && !busy && !limited && !disabled && periodOk;

  async function send(question: string) {
    const content = question.trim();
    if (!content || !canSend) return;
    setPageError(null);
    let conversationId = selected;
    try {
      if (!conversationId) {
        conversationId = (await mutations.create.mutateAsync(undefined)).id;
        setSelected(conversationId);
      }
    } catch (error) { setPageError(errorText(error)); return; }
    const abort = new AbortController();
    controller.current = abort;
    setDraft("");
    setStream({ phase: "streaming", question: content, text: "", tool: null });
    const onEvent = (event: CopilotEvent) => {
      if (event.event === "delta") setStream(s => (s.phase === "idle" ? s : { ...s, text: s.text + event.data.text, tool: null }));
      else if (event.event === "tool") setStream(s => (s.phase === "idle" ? s : { ...s, tool: event.data.label }));
      else if (event.event === "refused") setStream(s => (s.phase === "idle" ? s : { ...s, phase: "refused", text: "", message: event.data.message }));
      else if (event.event === "error") setStream(s => (s.phase === "idle" ? s : { ...s, phase: "error", message: event.data.message }));
      else if (event.event === "done") setStream(s => (s.phase === "refused" ? s : { phase: "idle" }));
    };
    try {
      await streamCopilotTurn(home, conversationId, { content, period_from: from, period_to: to }, onEvent, abort.signal);
      setStream(s => (s.phase === "streaming" ? { ...s, phase: "error", message: "La respuesta se cortó antes de terminar." } : s));
    } catch (error) {
      if (abort.signal.aborted) setStream(s => (s.phase === "idle" ? s : { ...s, phase: "cancelled" }));
      else setStream(s => (s.phase === "idle" ? s : { ...s, phase: "error", message: errorText(error) }));
    } finally {
      controller.current = null;
      // La API guarda la pregunta y la respuesta (también si se canceló): se vuelve a leer el historial y el uso.
      setTimeout(() => {
        void qc.invalidateQueries({ queryKey: copilotKeys.root(home) });
      }, 300);
      if (announce.current) announce.current.textContent = "Respuesta del Copilot actualizada.";
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void send(draft);
  }
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send(draft);
    }
  }

  const actions = copilotQuickActions(periodOk ? { from, to } : null);
  const history = messages.data ?? [];
  const showStream = stream.phase !== "idle";
  // Mientras llega la respuesta, la pregunta ya guardada puede aparecer en el historial: no se duplica.
  const pendingQuestion = showStream && !(history.length && history[history.length - 1].role === "user" && history[history.length - 1].content === stream.question);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Sparkles className="h-6 w-6 text-primary" aria-hidden /> Energy Copilot</h1>
        <p className="text-pretty text-sm text-muted-foreground">
          Pregunta sobre tu consumo, tus facturas y cómo ahorrar. Responde solo con los datos registrados de tu vivienda e indica su calidad;
          si falta algo, te dice qué registrar. No cambia tus datos.
        </p>
        {usage.data ? (
          <p className="text-xs text-muted-foreground" data-testid="copilot-usage">
            Hoy: {usage.data.messages_used} de {usage.data.messages_limit} preguntas.
          </p>
        ) : null}
      </header>
      <p ref={announce} className="sr-only" aria-live="polite" />

      {disabled ? (
        <Card role="status"><p className="text-sm">El Copilot no está disponible en este entorno por ahora.</p></Card>
      ) : null}
      {!online ? <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Sin conexión: podrás preguntar cuando vuelva internet.</p> : null}
      {limited ? <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Alcanzaste el límite diario del Copilot. Vuelve a intentarlo mañana.</p> : null}
      {pageError ? <p role="alert" className="rounded-lg bg-danger-bg p-3 text-sm text-danger">{pageError}</p> : null}

      <div className="grid min-w-0 gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <nav aria-label="Conversaciones" className="flex min-w-0 flex-col gap-3">
          <Button variant="outline" onClick={() => { setSelected(null); setStream({ phase: "idle" }); }} disabled={busy}>
            <MessageSquarePlus className="h-4 w-4" aria-hidden /> Nueva conversación
          </Button>
          <QueryState isLoading={conversations.isLoading} error={conversations.error} onRetry={() => void conversations.refetch()}>
            {conversations.data && conversations.data.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {conversations.data.map(c => (
                  <ConversationRow key={c.id} title={c.title} active={c.id === selected} disabled={busy}
                    onOpen={() => { setSelected(c.id); setStream({ phase: "idle" }); }}
                    onRename={title => mutations.rename.mutateAsync({ id: c.id, title })}
                    onDelete={() => setDeleting({ id: c.id, title: c.title })} />
                ))}
              </ul>
            ) : conversations.data ? <p className="text-sm text-muted-foreground">Aún no tienes conversaciones.</p> : null}
          </QueryState>
        </nav>

        <section aria-label="Chat" className="flex min-w-0 flex-col gap-4">
          {selected ? (
            <QueryState isLoading={messages.isLoading} error={messages.error} onRetry={() => void messages.refetch()}>
              <ol className="flex flex-col gap-4" aria-label="Mensajes">
                {history.map(m => (
                  <MessageItem key={m.id} message={m} onFeedback={value => mutations.feedback.mutate({ conversationId: m.conversation_id, messageId: m.id, value })}
                    feedbackPending={mutations.feedback.isPending} />
                ))}
              </ol>
            </QueryState>
          ) : !showStream ? (
            <EmptyState icon={Sparkles} title="¿En qué te ayudo?" hint="Elige una pregunta rápida o escribe la tuya. Usaré la vivienda y el período seleccionados." />
          ) : null}

          {showStream ? (
            <ol className="flex flex-col gap-4" aria-label="Respuesta en curso">
              {pendingQuestion ? <UserBubble text={stream.question} /> : null}
              <li className="flex flex-col gap-2 rounded-xl border border-border p-4" aria-busy={busy}>
                <p className="text-xs font-semibold text-muted-foreground">Copilot</p>
                {stream.tool ? <p role="status" className="text-sm text-muted-foreground">{stream.tool}…</p> : null}
                {busy && !stream.text && !stream.tool ? <p role="status" className="text-sm text-muted-foreground">Pensando…</p> : null}
                {stream.text ? <CopilotMarkdown text={stream.text} /> : null}
                {stream.phase === "cancelled" ? <p role="status" className="text-sm text-muted-foreground">Respuesta cancelada.</p> : null}
                {stream.phase === "refused" || stream.phase === "error" ? <p role="alert" className="text-sm text-danger">{stream.message}</p> : null}
                {busy ? (
                  <div><Button variant="outline" size="sm" onClick={() => controller.current?.abort()}>Detener respuesta</Button></div>
                ) : stream.phase === "cancelled" || stream.phase === "error" ? (
                  <div><Button variant="outline" size="sm" onClick={() => void send(stream.question)} disabled={!canSend}>Reintentar</Button></div>
                ) : null}
              </li>
            </ol>
          ) : null}

          {!disabled ? (
            <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl border border-border p-4" aria-label="Preguntar al Copilot">
              <fieldset className="flex flex-wrap items-end gap-3">
                <legend className="mb-2 text-sm font-medium">Período</legend>
                <Field label="Desde" type="date" width="sm" value={from} max={today} onChange={e => setFrom(e.target.value)} />
                <Field label="Hasta" type="date" width="sm" value={to} max={today} onChange={e => setTo(e.target.value)}
                  error={periodOk ? undefined : "Elige un período de hasta 366 días que termine hoy o antes."} />
              </fieldset>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Preguntas rápidas">
                {actions.map(a => (
                  <Button key={a.id} type="button" variant="outline" size="sm" disabled={!canSend} onClick={() => void send(a.prompt)}>{a.label}</Button>
                ))}
              </div>
              <Composer value={draft} onChange={setDraft} onKeyDown={onKeyDown} disabled={!online || limited || busy} />
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={!canSend || !draft.trim()} loading={busy}>{busy ? "Respondiendo…" : "Enviar"}</Button>
                <p className="text-xs text-muted-foreground">Intro envía · Mayús+Intro, nueva línea. Las respuestas pueden contener errores: revisa las fuentes.</p>
              </div>
            </form>
          ) : null}
        </section>
      </div>

      <Modal open={!!deleting} title="Borrar conversación" description={deleting ? `Se borrará «${deleting.title}» con todos sus mensajes. No se puede deshacer.` : undefined}
        onClose={() => setDeleting(null)} dismissible={!mutations.remove.isPending}>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => setDeleting(null)} disabled={mutations.remove.isPending}>Cancelar</Button>
          <Button variant="danger" loading={mutations.remove.isPending} onClick={async () => {
            if (!deleting) return;
            try {
              await mutations.remove.mutateAsync(deleting.id);
              if (selected === deleting.id) { setSelected(null); setStream({ phase: "idle" }); }
              setDeleting(null);
            } catch (error) { setPageError(errorText(error)); setDeleting(null); }
          }}>Borrar</Button>
        </div>
      </Modal>
    </div>
  );
}

function Composer({ value, onChange, onKeyDown, disabled }: { value: string; onChange: (v: string) => void; onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void; disabled: boolean }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">Tu pregunta</label>
      <textarea id={id} value={value} maxLength={4000} rows={3} disabled={disabled} onChange={e => onChange(e.target.value)} onKeyDown={onKeyDown}
        className={cn(controlClass, "h-auto min-h-20 resize-y py-2 pointer-coarse:h-auto")} placeholder="Por ejemplo: ¿por qué subió mi factura de septiembre?" />
      <p className="text-right text-xs text-muted-foreground" aria-live="off">{value.length}/4000</p>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <li className="ml-auto max-w-[85%] rounded-xl bg-primary/10 p-3">
      <p className="text-xs font-semibold text-muted-foreground">Tú</p>
      <p className="whitespace-pre-wrap break-words text-sm">{text}</p>
    </li>
  );
}

function MessageItem({ message, onFeedback, feedbackPending }: { message: CopilotMessage; onFeedback: (value: 1 | -1 | null) => void; feedbackPending: boolean }) {
  if (message.role === "user") return <UserBubble text={message.content} />;
  const statusNote = message.status === "cancelled" ? "Respuesta cancelada." : message.status === "error" ? "El Copilot no pudo responder."
    : message.status === "refused" ? "El Copilot no puede ayudar con esa solicitud." : null;
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border p-4">
      <p className="text-xs font-semibold text-muted-foreground">Copilot</p>
      {message.content ? <CopilotMarkdown text={message.content} /> : null}
      {statusNote ? <p className="text-sm text-muted-foreground">{statusNote}</p> : null}
      {message.sources.length ? (
        <details className="rounded-lg bg-muted/50 p-2 text-sm">
          <summary className="cursor-pointer py-1 font-medium">Fuentes consultadas ({message.sources.length})</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {message.sources.map((s, i) => (
              <li key={`${s.kind}-${s.href}-${i}`} className="flex flex-wrap items-center gap-2">
                {s.href ? <Link href={s.href} className={inlineLinkClass}>{s.label}</Link> : <span>{s.label}</span>}
                <DataStatusBadge quality={s.quality} always />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {message.status === "complete" ? (
        <div className="flex items-center gap-1" role="group" aria-label="¿Te sirvió esta respuesta?">
          <Button variant="tertiary" size="icon" aria-label="Útil" aria-pressed={message.feedback === 1} disabled={feedbackPending}
            onClick={() => onFeedback(message.feedback === 1 ? null : 1)}><ThumbsUp className="h-4 w-4" aria-hidden /></Button>
          <Button variant="tertiary" size="icon" aria-label="No útil" aria-pressed={message.feedback === -1} disabled={feedbackPending}
            onClick={() => onFeedback(message.feedback === -1 ? null : -1)}><ThumbsDown className="h-4 w-4" aria-hidden /></Button>
        </div>
      ) : null}
    </li>
  );
}

function ConversationRow({ title, active, disabled, onOpen, onRename, onDelete }: {
  title: string; active: boolean; disabled: boolean; onOpen: () => void; onRename: (title: string) => Promise<unknown>; onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [error, setError] = useState<string | undefined>();
  if (editing) {
    return (
      <li>
        <form className="flex flex-col gap-2" onSubmit={async e => {
          e.preventDefault();
          if (!value.trim()) { setError("Escribe un título."); return; }
          try { await onRename(value.trim()); setEditing(false); setError(undefined); } catch { setError("No se pudo renombrar."); }
        }}>
          <Field label="Nuevo título" value={value} maxLength={120} onChange={e => setValue(e.target.value)} error={error} width="full" autoFocus />
          <div className="flex gap-2">
            <Button type="submit" size="sm">Guardar</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => { setEditing(false); setValue(title); setError(undefined); }}>Cancelar</Button>
          </div>
        </form>
      </li>
    );
  }
  return (
    <li className={cn("flex min-w-0 items-center gap-1 rounded-lg", active && "bg-muted")}>
      <button type="button" onClick={onOpen} disabled={disabled} aria-current={active ? "true" : undefined}
        className="min-h-9 min-w-0 flex-1 truncate rounded-lg px-2 py-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary pointer-coarse:min-h-11">
        {title}
      </button>
      <Button variant="tertiary" size="icon" aria-label={`Renombrar «${title}»`} disabled={disabled} onClick={() => { setValue(title); setEditing(true); }}>
        <Pencil className="h-4 w-4" aria-hidden />
      </Button>
      <Button variant="tertiary" size="icon" aria-label={`Borrar «${title}»`} disabled={disabled} onClick={onDelete}>
        <Trash2 className="h-4 w-4" aria-hidden />
      </Button>
    </li>
  );
}
