"use client";
import { ApiError } from "@energyrd/api-client";
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DistributorSchema, type Home, type ContractOut } from "@energyrd/api-contracts";
import { readProfileHome, saveOnboardingHome, readProfileContract, saveOnboardingContract, type HomeDraft } from "@/lib/auth/onboarding";
import { accountGeneration, assertAccountGeneration } from "@/lib/auth/client";
import { useSession } from "@/lib/session";
import { keys, invalidateHome } from "@/lib/api/hooks";
import { userMessage } from "@/lib/api/errors";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

const texts = [["name", "Nombre de la vivienda"], ["address", "Dirección"], ["city", "Ciudad"], ["province", "Provincia"], ["municipality", "Municipio"], ["sector", "Sector"], ["user_type", "Tipo de usuario"]] as const;
const flags = [["has_ac", "Aire acondicionado"], ["has_water_heater", "Calentador de agua"], ["has_pool", "Piscina"], ["has_solar", "Paneles solares"], ["has_inverter", "Inversor"]] as const;
const selectClass = "h-11 rounded-lg border border-border bg-background px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
function HomeForm({ home, reload }: { home: Home; reload: () => Promise<unknown> }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<HomeDraft>({});
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invalidField, setInvalidField] = useState<string | null>(null);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    setInvalidField(null);
    const normalized = { ...draft };
    for (const [key] of texts) {
      if (!Object.hasOwn(normalized, key)) continue;
      const value = normalized[key]?.trim() ?? "";
      if ((key === "name" && !value) || value.length > (key === "address" ? 255 : 120)) {
        setInvalidField(key); event.currentTarget.querySelector<HTMLInputElement>(`#profile-${key}`)?.focus();
        setError("Revisa los datos de la vivienda: nombre obligatorio y textos de hasta 120 caracteres (dirección: 255)."); return;
      }
      Object.assign(normalized, { [key]: value || null });
    }
    if (normalized.occupants != null && (!Number.isInteger(normalized.occupants) || normalized.occupants < 1 || normalized.occupants > 999)) {
      setInvalidField("occupants"); event.currentTarget.querySelector<HTMLInputElement>("#profile-occupants")?.focus();
      setError("Revisa los datos de la vivienda: indica entre 1 y 999 ocupantes, sin decimales."); return;
    }
    const current = accountGeneration();
    setPending(true); setError(null); setMessage(null);
    try {
      await saveOnboardingHome(home.id, normalized);
      assertAccountGeneration(current);
      await reload();
      assertAccountGeneration(current);
      await Promise.all([invalidateHome(qc, home.id), qc.invalidateQueries({ queryKey: keys.homes, exact: true })]);
      assertAccountGeneration(current);
      setDraft({}); setMessage("Vivienda guardada.");
    } catch (cause) { setError(userMessage(cause, "load")); }
    finally { setPending(false); }
  }
  return <Card><h2 className="text-xl font-semibold">Mi vivienda</h2><p className="my-3 text-sm text-muted-foreground">Solo se guardan los campos que modificas. «Sin indicar» significa desconocido, no «No». El tipo de usuario es texto libre y no define una tarifa.</p>
    <form onSubmit={event => void save(event)} aria-busy={pending} className="grid gap-4 sm:grid-cols-2">
      {texts.map(([key, label]) => <Field key={key} name={`profile-${key}`} label={label} error={invalidField === key ? error ?? undefined : undefined} value={Object.hasOwn(draft, key) ? draft[key] ?? "" : home[key] ?? ""} onChange={event => setDraft(old => ({ ...old, [key]: event.target.value || null }))} required={key === "name"} maxLength={key === "address" ? 255 : 120} />)}
      <label htmlFor="profile-distributor" className="flex flex-col gap-1 text-sm">Distribuidora<select id="profile-distributor" className={selectClass} value={draft.distributor ?? home.distributor} onChange={event => setDraft(old => ({ ...old, distributor: DistributorSchema.parse(event.target.value) }))}>{DistributorSchema.options.map(value => <option key={value}>{value}</option>)}</select></label>
      <Field name="profile-occupants" label="Ocupantes" error={invalidField === "occupants" ? error ?? undefined : undefined} type="number" min={1} max={999} step={1} value={Object.hasOwn(draft, "occupants") ? draft.occupants ?? "" : home.occupants ?? ""} onChange={event => setDraft(old => ({ ...old, occupants: event.target.value ? Number(event.target.value) : null }))} />
      {flags.map(([key, label]) => { const value = Object.hasOwn(draft, key) ? draft[key] : home[key]; return <label key={key} htmlFor={`profile-${key}`} className="flex flex-col gap-1 text-sm">{label}<select id={`profile-${key}`} className={selectClass} value={value == null ? "" : value ? "yes" : "no"} onChange={event => setDraft(old => ({ ...old, [key]: event.target.value === "" ? null : event.target.value === "yes" }))}><option value="">Sin indicar</option><option value="yes">Sí</option><option value="no">No</option></select></label>; })}
      {error && !invalidField ? <p role="alert" className="text-sm text-danger sm:col-span-2">{error}</p> : null}
      {message ? <p role="status" className="text-sm sm:col-span-2">{message}</p> : null}
      <Button type="submit" disabled={pending || !Object.keys(draft).length}>{pending ? "Guardando…" : "Guardar vivienda"}</Button>
    </form>
  </Card>;
}
function ServiceForm({ homeId, contract, reload }: { homeId: string; contract?: ContractOut; reload: () => Promise<unknown> }) {
  const [number, setNumber] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    const accountNumber = (number ?? "").trim();
    setInvalid(false);
    if (!accountNumber || accountNumber.length > 120) { setInvalid(true); setError("Indica un número de cuenta de 1 a 120 caracteres."); event.currentTarget.querySelector<HTMLInputElement>("#profile-contract")?.focus(); return; }
    const current = accountGeneration();
    setPending(true); setError(null); setMessage(null);
    try {
      await saveOnboardingContract(homeId, accountNumber);
      assertAccountGeneration(current);
      await reload();
      assertAccountGeneration(current);
      setNumber(null); setMessage("Servicio guardado.");
    } catch (cause) { setError(userMessage(cause, "load")); }
    finally { setPending(false); }
  }
  return <form onSubmit={event => void save(event)} aria-busy={pending} className="mt-4 flex flex-col gap-4">
    <Field name="profile-contract" label="Número de cuenta" error={invalid ? error ?? undefined : undefined} value={number ?? contract?.account_number ?? ""} onChange={event => setNumber(event.target.value)} required maxLength={120} hint="No verificamos la titularidad del contrato. No se admite borrar el contrato." />
    {error && !invalid ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    {message ? <p role="status">{message}</p> : null}
    <Button type="submit" disabled={pending || number === null}>{pending ? "Guardando…" : "Guardar servicio"}</Button>
  </form>;
}
export default function ProfilePage() {
  const { homeId, user, authEnabled, ready } = useSession();
  const scope = ["profile", user?.id ?? "", homeId ?? ""];
  const home = useQuery({ queryKey: [...scope, "home"], queryFn: () => readProfileHome(homeId!), enabled: ready && authEnabled && !!user && !!homeId, retry: false });
  const contract = useQuery({ queryKey: [...scope, "contract"], queryFn: () => readProfileContract(homeId!), enabled: ready && authEnabled && !!user && !!homeId && home.isSuccess, retry: false });
  const missingContract = contract.error instanceof ApiError && contract.error.status === 404;
  return <div className="flex flex-col gap-6"><h1 className="text-2xl font-bold">Perfil</h1>
    <Card><h2 className="text-xl font-semibold">Mi cuenta</h2><p className="mt-3 break-words">{user?.email ?? "Cuenta no disponible en el piloto."}</p><p className="mt-3 text-sm text-muted-foreground">Preferencias de notificación no disponibles: todavía no existe un servicio para consultarlas o guardarlas.</p></Card>
    {!authEnabled ? <p role="status">La edición de vivienda y servicio requiere una cuenta autenticada. No está disponible en el piloto.</p> : home.isPending ? <p role="status">Cargando vivienda…</p> : home.isError ? <Card><p role="alert">{userMessage(home.error, "load")}</p><Button variant="outline" onClick={() => void home.refetch()}>Reintentar lectura de vivienda</Button></Card> : home.data ? <HomeForm key={scope.join(":")} home={home.data} reload={() => home.refetch({ throwOnError: true })} /> : null}
    {authEnabled && home.isSuccess ? <Card><h2 className="text-xl font-semibold">Mi servicio</h2><p className="mt-3 text-sm">Distribuidora: {home.data.distributor}</p>
      {contract.isPending ? <p role="status">Cargando servicio…</p> : contract.isError && !missingContract ? <><p role="alert">{userMessage(contract.error, "load")}</p><Button variant="outline" onClick={() => void contract.refetch()}>Reintentar lectura de servicio</Button></> : <>{missingContract ? <p role="status" className="mt-3 text-sm">Servicio no encontrado o sin acceso. Puedes registrar un número; el servidor comprobará el acceso al guardar.</p> : null}<ServiceForm key={scope.join(":")} homeId={homeId!} contract={contract.data} reload={() => contract.refetch({ throwOnError: true })} /></>}
    </Card> : null}
  </div>;
}
