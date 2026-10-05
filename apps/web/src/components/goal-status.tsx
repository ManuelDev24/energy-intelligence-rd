import { CircleCheck, CircleHelp, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import type { GoalStatus } from "@/lib/api/schemas";
import { cn } from "@/lib/cn";

// Estado de la meta = ícono + texto + color (nunca solo color). Colores desde los tokens.
export const GOAL_STATUS: Record<GoalStatus, { label: string; hint: string; icon: LucideIcon; className: string }> = {
  on_track: {
    label: "En camino",
    hint: "Al ritmo actual cerrarías el mes dentro de tu meta.",
    icon: CircleCheck,
    className: "border-success-border bg-success-bg text-success",
  },
  at_risk: {
    label: "En riesgo",
    hint: "Al ritmo actual superarías tu meta antes de fin de mes.",
    icon: TriangleAlert,
    className: "border-warning-border bg-warning-bg text-warning",
  },
  exceeded: {
    label: "Meta excedida",
    hint: "Lo registrado este mes ya supera tu meta.",
    icon: OctagonAlert,
    className: "border-danger-border bg-danger-bg text-danger",
  },
  insufficient_data: {
    label: "Datos insuficientes",
    hint: "Aún no hay datos suficientes para saber si cumplirás tu meta.",
    icon: CircleHelp,
    className: "border-dashed border-muted-foreground bg-muted text-muted-foreground",
  },
};

export function GoalStatusBadge({ status, className }: { status: GoalStatus; className?: string }) {
  const s = GOAL_STATUS[status];
  const Icon = s.icon;
  return (
    <span
      data-status={status}
      className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold", s.className, className)}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {s.label}
    </span>
  );
}
