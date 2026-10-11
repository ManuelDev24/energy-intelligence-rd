import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { AlertCard } from "./alert-card";

/**
 * ERD-UI-KIT: recomendación que redacta la API. Sin texto de la API muestra un mensaje neutro (no inventa consejos).
 * La acción opcional lleva a donde la persona puede actuar.
 */
export function RecommendationCard({ text, action }: { text: string | null | undefined; action?: { href: string; label: string } }) {
  return (
    <AlertCard
      tone="savings"
      title="Recomendación"
      action={action ? (
        <Link href={action.href}
          className="inline-flex h-11 items-center gap-1 rounded-lg px-1 text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          {action.label} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      ) : undefined}
    >
      {text ?? "Sin recomendaciones por ahora."}
    </AlertCard>
  );
}
