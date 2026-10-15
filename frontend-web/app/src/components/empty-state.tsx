import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface EmptyStateProps {
  title: string;
  /** Qué falta y cómo conseguirlo, en lenguaje simple. */
  hint?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
}

/** Estado vacío: en lugar de una gráfica o métrica sin datos, se explica qué falta. */
export function EmptyState({ title, hint, icon: Icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-8 text-center",
        className,
      )}
    >
      {Icon ? <Icon className="h-6 w-6 text-muted-foreground" aria-hidden /> : null}
      <p className="font-semibold">{title}</p>
      {hint ? <p className="max-w-md text-pretty text-sm text-muted-foreground">{hint}</p> : null}
      {action}
    </div>
  );
}
