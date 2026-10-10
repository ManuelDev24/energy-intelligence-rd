"use client";
import { MAX_RANGE_DAYS } from "@energyrd/core";
import { CalendarRange } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/cn";

export const segmentClass = (active: boolean) =>
  cn(
    "inline-flex h-11 items-center rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
    active ? "border-primary bg-brand-50 text-primary" : "border-border bg-background text-foreground hover:bg-muted",
  );

export interface RangePresetOption<K extends string> { id: K; label: string }

/**
 * ERD-UI-KIT: selector de rango (atajos + «Personalizado» con dos fechas). Controlado: el llamador valida con
 * `validateRange` (@energyrd/core) y pasa el mensaje en `error`. Las fechas no pueden ser posteriores a `today`.
 */
export function DateRangePicker<K extends string>({ presets, selected, from, to, today, error, onPreset, onFrom, onTo, legend = "Rango" }: {
  presets: readonly RangePresetOption<K>[];
  selected: K | "custom";
  from: string;
  to: string;
  today: string;
  error: string | null;
  onPreset: (preset: K | "custom") => void;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
  legend?: string;
}) {
  const id = useId();
  const field = (name: "from" | "to", label: string, value: string, onChange: (v: string) => void) => (
    <label className="flex flex-col gap-1 text-sm font-medium" htmlFor={`${id}-${name}`}>
      {label}
      <input id={`${id}-${name}`} type="date" value={value} max={today} aria-invalid={error ? true : undefined} aria-describedby={`${id}-range`}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 rounded-lg border border-border bg-background px-3 text-base font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:text-sm" />
    </label>
  );
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => (
          <button key={preset.id} type="button" aria-pressed={selected === preset.id} className={segmentClass(selected === preset.id)} onClick={() => onPreset(preset.id)}>
            {preset.label}
          </button>
        ))}
        <button type="button" aria-pressed={selected === "custom"} className={segmentClass(selected === "custom")} onClick={() => onPreset("custom")}>
          <CalendarRange className="mr-1.5 h-4 w-4" aria-hidden /> Personalizado
        </button>
      </div>
      {selected === "custom" ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-end gap-3">
            {field("from", "Desde", from, onFrom)}
            {field("to", "Hasta", to, onTo)}
          </div>
          <p id={`${id}-range`} role={error ? "alert" : undefined} className={cn("text-xs", error ? "text-danger" : "text-muted-foreground")}>
            {error ?? `Máximo ${MAX_RANGE_DAYS} días, ambos incluidos.`}
          </p>
        </div>
      ) : null}
    </fieldset>
  );
}
