"use client";

import { suggestNextPeriod } from "@energyrd/core";
import { useRouter } from "next/navigation";
import { BillForm } from "@/components/bill-form";
import { QueryState } from "@/components/query-state";
import { useBills, useCreateBill } from "@/lib/api/hooks";
import { emptyBillForm } from "@/lib/bill-form";
import { useSession } from "@/lib/session";

export default function NewBillPage() {
  const router = useRouter();
  const { homeId } = useSession();
  const create = useCreateBill(homeId ?? "");
  const bills = useBills(homeId ?? "");
  // Período sugerido: continúa la última factura (las distribuidoras facturan ciclos seguidos).
  const last = [...(bills.data ?? [])].sort((a, b) => b.period_end.localeCompare(a.period_end))[0];
  const next = suggestNextPeriod(last ?? null);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Registrar factura</h1>
      <p className="text-sm text-muted-foreground">
        El período viene sugerido a partir de tu última factura; corrígelo si tu factura dice otra cosa.
      </p>
      <QueryState isLoading={bills.isLoading} error={null}>
        <BillForm
          key={last?.id ?? "first"}
          initial={{ ...emptyBillForm, period_start: next.period_start, period_end: next.period_end, days: String(next.days) }}
          submitLabel="Guardar factura"
          pending={create.isPending}
          serverError={create.error?.message}
          onSubmit={(value) => create.mutate(value, { onSuccess: () => router.push("/dashboard") })}
          onCancel={() => router.push("/bills")}
        />
      </QueryState>
    </div>
  );
}
