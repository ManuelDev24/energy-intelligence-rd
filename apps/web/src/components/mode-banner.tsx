import { env } from "@/lib/env";

// Aviso permanente cuando la web corre con fixtures demo en vez de la API real.
export function ModeBanner() {
  if (env.NEXT_PUBLIC_API_MODE !== "mock") return null;
  return (
    <div role="status" className="bg-amber-100 px-4 py-2 text-center text-xs text-amber-900">
      Modo demo: los datos son fixtures de ejemplo, no provienen de la API.
    </div>
  );
}
