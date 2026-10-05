"use client";

import { NotebookPen, Receipt } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";
import { BillsConsumption } from "@/features/consumption/BillsConsumption";
import { ReadingsConsumption } from "@/features/consumption/ReadingsConsumption";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/session";

const TABS = [
  { id: "readings", label: "Por lecturas", icon: NotebookPen },
  { id: "bills", label: "Por factura", icon: Receipt },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default function ConsumptionPage() {
  const { homeId } = useSession();
  const [tab, setTab] = useState<Tab>("readings");
  const refs = useRef<Record<Tab, HTMLButtonElement | null>>({ readings: null, bills: null });

  // Patrón de pestañas WAI-ARIA: flechas izquierda/derecha cambian de pestaña y mueven el foco.
  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const index = TABS.findIndex((t) => t.id === tab);
    const next = TABS[(index + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length].id;
    setTab(next);
    refs.current[next]?.focus();
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Consumo</h1>
        <p className="text-pretty text-sm text-muted-foreground">
          Por lecturas del medidor (día, semana o mes) o por factura (mensual, como siempre).
        </p>
      </header>
      <div role="tablist" aria-label="Fuente del consumo" className="flex gap-1 self-start rounded-xl border border-border bg-background p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            ref={(el) => {
              refs.current[id] = el;
            }}
            id={`tab-${id}`}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onKeyDown={onKeyDown}
            onClick={() => setTab(id)}
            className={cn(
              "inline-flex h-11 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              tab === id ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden /> {label}
          </button>
        ))}
      </div>
      {/* Ambos paneles existen (aria-controls siempre apunta a un elemento); el inactivo queda oculto. */}
      {TABS.map(({ id }) => (
        <div
          key={id}
          id={`panel-${id}`}
          role="tabpanel"
          aria-labelledby={`tab-${id}`}
          hidden={tab !== id}
          tabIndex={0}
          className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {id === "readings" ? <ReadingsConsumption homeId={homeId ?? ""} /> : <BillsConsumption />}
        </div>
      ))}
    </div>
  );
}
