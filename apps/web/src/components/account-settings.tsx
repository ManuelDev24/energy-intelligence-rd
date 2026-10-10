"use client";
import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiMessage } from "@/lib/auth/request";
import {
  changePassword, exportMyData, getPreferences, listSessions, revokeOtherSessions, revokeSession, savePreferences,
} from "@/lib/auth/settings";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Field } from "./ui/field";

const dateTime = (iso: string) => new Date(iso).toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short" });

/** ERD-PROF-01: cambiar la contraseña con la sesión iniciada (cierra las demás sesiones). */
export function PasswordSection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const inFlight = useRef(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    setDone(false); setError(null);
    if (current.length < 12 || current.length > 128) { setError("Escribe tu contraseña actual (entre 12 y 128 caracteres)."); return; }
    if (next.length < 12 || next.length > 128) { setError("La nueva contraseña debe tener entre 12 y 128 caracteres."); return; }
    if (next === current) { setError("La nueva contraseña debe ser distinta de la actual."); return; }
    if (next !== confirmation) { setError("Las contraseñas nuevas no coinciden."); return; }
    inFlight.current = true; setPending(true);
    try {
      await changePassword(current, next);
      setCurrent(""); setNext(""); setConfirmation(""); setDone(true);
    } catch (cause) {
      setError(apiMessage(cause));
    } finally { inFlight.current = false; setPending(false); }
  }
  return (
    <Card>
      <h2 className="text-xl font-semibold">Cambiar contraseña</h2>
      <p className="mt-2 text-sm text-muted-foreground">Al cambiarla se cierran las sesiones abiertas en otros dispositivos. Esta sesión sigue activa.</p>
      <form className="mt-4 flex flex-col gap-4" onSubmit={(event) => void submit(event)} aria-busy={pending} noValidate>
        <Field name="current-password" label="Contraseña actual" type="password" autoComplete="current-password" maxLength={128} value={current} onChange={(e) => setCurrent(e.target.value)} disabled={pending} />
        <Field name="new-password" label="Nueva contraseña" type="password" autoComplete="new-password" maxLength={128} hint="Entre 12 y 128 caracteres." value={next} onChange={(e) => setNext(e.target.value)} disabled={pending} />
        <Field name="confirm-new-password" label="Confirmar nueva contraseña" type="password" autoComplete="new-password" maxLength={128} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} disabled={pending} />
        {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
        {done ? <p role="status" className="text-sm text-green-700">Contraseña cambiada. Se cerraron las demás sesiones.</p> : null}
        <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Cambiar contraseña"}</Button>
      </form>
    </Card>
  );
}

/** ERD-PROF-01: preferencias de aviso. Se guardan ya; los envíos llegan con ERD-ALERT-02. */
export function NotificationsSection() {
  const qc = useQueryClient();
  const prefs = useQuery({ queryKey: ["account", "preferences"], queryFn: getPreferences, retry: false });
  const [draft, setDraft] = useState<{ email: boolean; push: boolean } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (value: { email: boolean; push: boolean }) => savePreferences(value.email, value.push),
    onSuccess: async () => { setDraft(null); setNotice("Preferencias guardadas."); await qc.invalidateQueries({ queryKey: ["account", "preferences"] }); },
  });
  const value = draft ?? (prefs.data ? { email: prefs.data.alerts_email, push: prefs.data.alerts_push } : null);
  return (
    <Card>
      <h2 className="text-xl font-semibold">Notificaciones</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Elige cómo quieres recibir los avisos de consumo. Tus elecciones se guardan ahora y se aplicarán cuando se activen los
        envíos de alertas (todavía no se envía ningún aviso por correo ni al teléfono).
      </p>
      {prefs.isLoading ? <p role="status" className="mt-3 text-sm">Cargando…</p> : null}
      {prefs.isError ? (
        <div className="mt-3"><p role="alert" className="text-sm text-red-600">{apiMessage(prefs.error)}</p>
          <Button type="button" variant="outline" className="mt-2" onClick={() => void prefs.refetch()}>Reintentar</Button></div>
      ) : null}
      {value ? (
        <form className="mt-4 flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); setNotice(null); save.mutate(value); }}>
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={value.email} onChange={(e) => setDraft({ ...value, email: e.target.checked })} disabled={save.isPending} /> Avisos de consumo por correo</label>
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={value.push} onChange={(e) => setDraft({ ...value, push: e.target.checked })} disabled={save.isPending} /> Avisos en el teléfono (app móvil)</label>
          {save.isError ? <p role="alert" className="text-sm text-red-600">{apiMessage(save.error)}</p> : null}
          {notice ? <p role="status" className="text-sm text-green-700">{notice}</p> : null}
          <Button type="submit" disabled={save.isPending || draft === null}>{save.isPending ? "Guardando…" : "Guardar preferencias"}</Button>
        </form>
      ) : null}
    </Card>
  );
}

/** ERD-PROF-01: sesiones activas de la cuenta. Cerrar una o todas las demás. */
export function SessionsSection() {
  const qc = useQueryClient();
  const sessions = useQuery({ queryKey: ["account", "sessions"], queryFn: listSessions, retry: false });
  const [notice, setNotice] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["account", "sessions"] });
  const run = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onMutate: () => setNotice(null),
  });
  const others = sessions.data?.filter((s) => !s.current) ?? [];
  return (
    <Card>
      <h2 className="text-xl font-semibold">Sesiones activas</h2>
      <p className="mt-2 text-sm text-muted-foreground">Dispositivos donde tu cuenta tiene la sesión abierta. Si no reconoces alguna, ciérrala y cambia tu contraseña.</p>
      {sessions.isLoading ? <p role="status" className="mt-3 text-sm">Cargando…</p> : null}
      {sessions.isError ? (
        <div className="mt-3"><p role="alert" className="text-sm text-red-600">{apiMessage(sessions.error)}</p>
          <Button type="button" variant="outline" className="mt-2" onClick={() => void sessions.refetch()}>Reintentar</Button></div>
      ) : null}
      <ul className="mt-3 flex flex-col gap-2">
        {sessions.data?.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm">
            <span>Iniciada el {dateTime(s.created_at)}{s.current ? <strong> · Esta sesión</strong> : null}</span>
            {!s.current ? (
              <Button type="button" variant="outline" disabled={run.isPending} aria-label={`Cerrar la sesión iniciada el ${dateTime(s.created_at)}`}
                onClick={() => run.mutate(() => revokeSession(s.id), { onSuccess: async () => { setNotice("Sesión cerrada."); await refresh(); } })}>Cerrar</Button>
            ) : null}
          </li>
        ))}
      </ul>
      {run.isError ? <p role="alert" className="mt-3 text-sm text-red-600">{apiMessage(run.error)}</p> : null}
      {notice ? <p role="status" className="mt-3 text-sm text-green-700">{notice}</p> : null}
      {others.length > 0 ? (
        <Button type="button" variant="outline" className="mt-3" disabled={run.isPending}
          onClick={() => run.mutate(() => revokeOtherSessions(), { onSuccess: async () => { setNotice("Se cerraron las demás sesiones."); await refresh(); } })}>
          Cerrar las demás sesiones
        </Button>
      ) : null}
    </Card>
  );
}

/** ERD-LEGAL-FINAL: derecho de acceso y portabilidad. Descarga el JSON del titular sin pasar por almacenamiento. */
export function DataExportSection() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const inFlight = useRef(false);
  async function download() {
    if (inFlight.current) return;
    inFlight.current = true; setPending(true); setError(null); setDone(false);
    try {
      const { text, filename } = await exportMyData();
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url; link.download = filename; link.rel = "noopener";
      document.body.appendChild(link); link.click(); link.remove();
      URL.revokeObjectURL(url);
      setDone(true);
    } catch (cause) {
      setError(apiMessage(cause));
    } finally { inFlight.current = false; setPending(false); }
  }
  return (
    <Card>
      <h2 className="text-xl font-semibold">Descargar mis datos</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Un archivo JSON con tu cuenta, tus viviendas, facturas, lecturas, equipos, alertas y metas. No incluye contraseñas, claves
        ni datos de otras personas. Guárdalo en un lugar seguro: contiene tus datos personales.
      </p>
      {error ? <p role="alert" className="mt-3 text-sm text-red-600">{error}</p> : null}
      {done ? <p role="status" className="mt-3 text-sm text-green-700">Descarga lista.</p> : null}
      <Button type="button" variant="outline" className="mt-4" onClick={() => void download()} disabled={pending}>{pending ? "Preparando…" : "Descargar mis datos"}</Button>
    </Card>
  );
}

export function AccountSettings() {
  return (
    <>
      <PasswordSection />
      <NotificationsSection />
      <SessionsSection />
      <DataExportSection />
    </>
  );
}
