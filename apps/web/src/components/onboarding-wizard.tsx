"use client";
import { useState, type FormEvent } from "react";
import { ApiError, ContractError } from "@energyrd/api-client";
import { accountGeneration, assertAccountGeneration } from "@/lib/auth/client";
import { DistributorSchema, type Distributor, type Home } from "@energyrd/api-contracts";
import { saveOnboardingContract, saveOnboardingGoal, saveOnboardingHome } from "@/lib/auth/onboarding";
import { validateGoalForm } from "@/features/goal/form";
import { Button } from "./ui/button";
import { Field } from "./ui/field";
import { Card } from "./ui/card";

const flags = [
  ["has_ac", "Aire acondicionado"], ["has_water_heater", "Calentador de agua"],
  ["has_pool", "Piscina"], ["has_solar", "Paneles solares"], ["has_inverter", "Inversor"],
] as const;
type Flag = typeof flags[number][0];
const titles = ["Bienvenida", "Ubicación", "Distribuidora", "Tipo de usuario", "Perfil energético", "Contrato", "Meta mensual", "Revisión"];
const options = ["", "yes", "no"] as const;
const clean = (value: string) => value.trim() || null;
export function OnboardingWizard({ onComplete, initialHome }: { onComplete: (homeId: string) => void; initialHome?: Home }) {
  const [step, setStep] = useState(0);
  const [id, setId] = useState<string | null>(initialHome?.id ?? null);
  const [name, setName] = useState(initialHome?.name ?? "");
  const [province, setProvince] = useState(initialHome?.province ?? "");
  const [municipality, setMunicipality] = useState(initialHome?.municipality ?? "");
  const [sector, setSector] = useState(initialHome?.sector ?? "");
  const [distributor, setDistributor] = useState<Distributor>(initialHome?.distributor ?? "EDESUR");
  const [userType, setUserType] = useState(initialHome?.user_type ?? "");
  const [occupants, setOccupants] = useState(initialHome?.occupants?.toString() ?? "");
  const [equipment, setEquipment] = useState<Record<Flag, string>>(() => Object.fromEntries(flags.map(([key]) => [key, initialHome?.[key] === null || initialHome?.[key] === undefined ? "" : initialHome[key] ? "yes" : "no"])) as Record<Flag, string>);
  const [accountNumber, setAccountNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [kwh, setKwh] = useState("");
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function next(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending || uncertain) return;
    setError(null);
    if (step === 1 && (!clean(name) || !clean(province) || !clean(municipality))) { setError("Indica nombre, provincia y municipio."); return; }
    if (step === 4 && occupants && (!/^[1-9]\d*$/.test(occupants) || Number(occupants) > 999)) { setError("Indica entre 1 y 999 ocupantes."); return; }
    if (step === 6 && (amount.trim() || kwh.trim()) && !validateGoalForm({ monthly_amount_rd: amount, monthly_kwh: kwh }).ok) { setError("Revisa la meta: valor mayor que 0 con hasta 2 decimales."); return; }
    if (step === 5 && accountNumber.trim().length > 120) { setError("El número de cuenta no puede exceder 120 caracteres."); return; }
    const current = accountGeneration();
    setPending(true);
    try {
      // La ubicación se conserva local hasta elegir distribuidora: la API exige ambas para crear.
      if (step === 2) {
        const result = await saveOnboardingHome(id, { name: name.trim(), province: province.trim(), municipality: municipality.trim(), sector: clean(sector), distributor });
        assertAccountGeneration(current);
        setId(result.id);
      }
      if (step === 3 && id) await saveOnboardingHome(id, { user_type: clean(userType) });
      if (step === 4 && id) await saveOnboardingHome(id, {
        occupants: occupants ? Number(occupants) : null,
        ...Object.fromEntries(flags.map(([key]) => [key, equipment[key] === "" ? null : equipment[key] === "yes"])),
      });
      if (step === 5 && id && clean(accountNumber)) await saveOnboardingContract(id, accountNumber.trim());
      if (step === 6 && id && (amount.trim() || kwh.trim())) {
        const parsed = validateGoalForm({ monthly_amount_rd: amount, monthly_kwh: kwh });
        if (parsed.ok) await saveOnboardingGoal(id, parsed.value);
      }
      assertAccountGeneration(current);
      setStep(current => current + 1);
    } catch (cause) {
      if (step === 2 && !id && (cause instanceof ContractError || (cause instanceof ApiError && (cause.status === 0 || cause.status >= 500)))) setUncertain(true);
      setError("No se pudo guardar. Consulta los datos de esta vivienda antes de reintentar.");
    }
    finally { setPending(false); }
  }
  return <Card><p className="text-sm text-muted-foreground">{step > 0 && step < 7 ? `Etapa ${step} de 6` : "Energy RD"}</p>
    <h2 className="mt-2 text-xl font-semibold">{titles[step]}</h2>
    {step === 0 ? <><p className="my-4 text-sm text-muted-foreground">Configura tu vivienda. Puedes dejar vacíos los datos opcionales y revisarlos después.</p><Button onClick={() => setStep(1)}>Empezar</Button></> : null}
    {step > 0 && step < 7 ? <form onSubmit={event => void next(event)} className="mt-4 flex flex-col gap-4" aria-busy={pending} noValidate>
      {step === 1 ? <><Field name="onb-name" label="Nombre de la vivienda" value={name} onChange={e => setName(e.target.value)} maxLength={120} required /><Field name="onb-province" label="Provincia" value={province} onChange={e => setProvince(e.target.value)} maxLength={120} required /><Field name="onb-municipality" label="Municipio" value={municipality} onChange={e => setMunicipality(e.target.value)} maxLength={120} required /><Field name="onb-sector" label="Sector (opcional)" value={sector} onChange={e => setSector(e.target.value)} maxLength={120} /></> : null}
      {step === 2 ? <label className="flex flex-col gap-2 text-sm" htmlFor="onb-distributor">Selecciona tu distribuidora<select id="onb-distributor" className="h-11 rounded-lg border border-border bg-background px-3" value={distributor} onChange={e => setDistributor(DistributorSchema.parse(e.target.value))}>{DistributorSchema.options.map(option => <option key={option}>{option}</option>)}</select></label> : null}
      {step === 3 ? <><Field name="onb-user-type" label="Tipo de usuario" value={userType} onChange={e => setUserType(e.target.value)} maxLength={120} hint="Texto libre; no se ha definido una clasificación oficial." /><p className="text-sm text-muted-foreground">Opcional. No implica una tarifa específica.</p></> : null}
      {step === 4 ? <><Field name="onb-occupants" label="Ocupantes" type="number" min={1} max={999} value={occupants} onChange={e => setOccupants(e.target.value)} /><p className="text-sm text-muted-foreground">Si no sabes la respuesta, deja «Sin indicar».</p>{flags.map(([key, label]) => <label key={key} htmlFor={key} className="flex flex-col gap-1 text-sm">{label}<select id={key} className="h-11 rounded-lg border border-border bg-background px-3" value={equipment[key]} onChange={e => setEquipment(old => ({ ...old, [key]: e.target.value }))}>{options.map((value, index) => <option key={value} value={value}>{["Sin indicar", "Sí", "No"][index]}</option>)}</select></label>)}</> : null}
      {step === 5 ? <><Field name="onb-contract" label="Número de cuenta" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} maxLength={120} /><p className="text-sm text-muted-foreground">Opcional. No verificamos la titularidad del contrato.</p></> : null}
      {step === 6 ? <><Field name="onb-amount" label="Meta de gasto mensual (RD$)" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /><Field name="onb-kwh" label="Meta de consumo mensual (kWh)" inputMode="decimal" value={kwh} onChange={e => setKwh(e.target.value)} /><p className="text-sm text-muted-foreground">Opcional. El gasto estimado depende de facturas o de una tarifa oficial disponible.</p></> : null}
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      {uncertain ? <a href="/homes" className="text-primary underline">Consultar mis viviendas antes de crear otra</a> : null}
      <div className="flex gap-3"><Button type="button" variant="outline" disabled={pending} onClick={() => setStep(current => current - 1)}>Atrás</Button><Button type="submit" disabled={pending || uncertain}>{pending ? "Guardando…" : "Guardar y continuar"}</Button></div>
    </form> : null}
    {step === 7 ? <><p className="my-4 text-sm">{name} · {province}, {municipality} · {distributor}</p><p className="mb-4 text-sm text-muted-foreground">Puedes editar tu meta y vivienda después. Los campos omitidos no se han supuesto.</p><Button onClick={() => { if (id) onComplete(id); }} disabled={!id}>Ir al panel</Button></> : null}
  </Card>;
}
