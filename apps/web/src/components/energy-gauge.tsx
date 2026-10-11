import { scoreBand, tokens } from "@energyrd/core";
import { cn } from "@/lib/cn";

const c = tokens.color;

/** Banda del valor: color + palabra (el color nunca va solo). Bandas orientativas, configurables. */
export function gaugeBand(value: number): { word: string; color: string } {
  const { key, word } = scoreBand(value);   // umbrales compartidos con el móvil y con el backend (ERD-SCORE-01)
  return { word, color: key === "good" ? c.success : key === "fair" ? c.notice : c.warning };
}

interface EnergyGaugeProps {
  /** Puntuación 0–100 que debe venir de la API (Energy Score). Se acota a 0–100. */
  value: number;
  label: string;
  /** Aclaración corta, p. ej. "Indicador interno y configurable". */
  helper?: string;
  className?: string;
}

/**
 * CH-09: medidor semicircular 0–100. Expone role="meter" con su valor para lectores de pantalla.
 * Se alimenta con el Energy Score del backend (ERD-SCORE-01); sin puntaje no se dibuja (ver `EnergyScoreCard`).
 */
export function EnergyGauge({ value, label, helper, className }: EnergyGaugeProps) {
  const v = Math.round(Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0)));
  const band = gaugeBand(v);
  const arc = "M 10 60 A 50 50 0 0 1 110 60";
  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={v}
        aria-valuetext={`${v} de 100, ${band.word.toLowerCase()}`}
        className="flex w-full flex-col items-center gap-1"
      >
        <svg viewBox="0 0 120 66" className="w-full max-w-[220px]" aria-hidden>
          <path d={arc} fill="none" stroke={c.chart.grid} strokeWidth="10" strokeLinecap="round" />
          {v > 0 ? (
            <path
              d={arc}
              fill="none"
              stroke={band.color}
              strokeWidth="10"
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray={`${v} 100`}
            />
          ) : null}
        </svg>
        <p aria-hidden className="-mt-10 text-3xl font-bold tabular-nums">
          {v}
          <span className="text-sm font-medium text-muted-foreground">/100</span>
        </p>
        <p aria-hidden className="text-sm font-semibold" style={{ color: band.color }}>
          {band.word}
        </p>
        <p aria-hidden className="text-sm text-muted-foreground">{label}</p>
      </div>
      {/* Fuera del meter: sus hijos son presentacionales y la ayuda no se leería. */}
      {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
    </div>
  );
}
