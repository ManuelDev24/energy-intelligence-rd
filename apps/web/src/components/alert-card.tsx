import { SEVERITY, type AlertTone } from "@energyrd/core";
import { Info, OctagonAlert, PiggyBank, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

// Severidad = color + ícono + texto (nunca solo color). Colores de SEVERITY (@energyrd/core).
const ICON: Record<AlertTone, LucideIcon> = {
  critical: OctagonAlert,
  warning: TriangleAlert,
  info: Info,
  savings: PiggyBank,
};

interface AlertCardProps {
  tone: AlertTone;
  /** Titular opcional; si falta, la tarjeta se nombra solo por su severidad. */
  title?: string;
  /** Texto principal (p. ej. el mensaje que redacta la API). */
  children?: ReactNode;
  /** Datos de apoyo a la derecha de la severidad: insignia "nueva", porcentaje… */
  meta?: ReactNode;
  /** Pie con detalles secundarios (período base, umbral). */
  footer?: ReactNode;
  /** Acción: enlace o botones. */
  action?: ReactNode;
  /** Anunciar al lector de pantalla en cuanto aparece (role="alert"). Solo para avisos urgentes. */
  announce?: boolean;
  as?: "article" | "li" | "div";
  className?: string;
}

/** Tarjeta de alerta/aviso en 4 tonos: crítica, advertencia, información y ahorro. */
export function AlertCard({
  tone,
  title,
  children,
  meta,
  footer,
  action,
  announce = false,
  as: Tag = "article",
  className,
}: AlertCardProps) {
  const s = SEVERITY[tone];
  const Icon = ICON[tone];
  return (
    <Tag
      role={announce ? "alert" : Tag === "li" ? undefined : "article"}
      aria-label={title ? `${s.short}: ${title}` : s.short}
      data-tone={tone}
      className={cn("flex items-start gap-3 rounded-xl border p-4", className)}
      style={{ backgroundColor: s.bg, borderColor: s.border }}
    >
      <Icon className="mt-px h-5 w-5 shrink-0" style={{ color: s.fg }} aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold" style={{ color: s.fg }}>
            <span>
              <span>{s.short}</span>
              {title ? <span className="text-foreground">: {title}</span> : null}
            </span>
            {meta}
          </p>
          {children ? <div className="text-pretty text-sm text-foreground">{children}</div> : null}
          {footer ? <div className="text-xs text-muted-foreground">{footer}</div> : null}
        </div>
        {action ? <div className="flex flex-wrap gap-2 sm:flex-col">{action}</div> : null}
      </div>
    </Tag>
  );
}
