"use client";

import { suggestNextPeriod } from "@energyrd/core";
import { useRouter } from "next/navigation";
import { useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { BillForm } from "@/components/bill-form";
import { QueryState } from "@/components/query-state";
import { useBills, useCreateBill, useOcrBill } from "@/lib/api/hooks";
import type { OcrDraft } from "@/lib/api/schemas";
import { emptyBillForm } from "@/lib/bill-form";
import { OCR_FIELDS, ocrDraftToBillForm } from "@/lib/bill-ocr";
import { useSession } from "@/lib/session";

const confidenceLabel = { high: "Alta", inferred: "Inferida", none: "No detectada" } as const;

export default function NewBillPage() {
  const router = useRouter();
  const { homeId } = useSession();
  const create = useCreateBill(homeId ?? "");
  const ocr = useOcrBill(homeId ?? "");
  const bills = useBills(homeId ?? "");
  const [draft, setDraft] = useState<OcrDraft | null>(null);
  const [manual, setManual] = useState(false);
  const last = [...(bills.data ?? [])].sort((a, b) => b.period_end.localeCompare(a.period_end))[0];
  const next = suggestNextPeriod(last ?? null);

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setDraft(null);
    ocr.mutate(file, { onSuccess: setDraft });
    event.target.value = "";
  }

  const initial = draft
    ? ocrDraftToBillForm(draft)
    : { ...emptyBillForm, period_start: next.period_start, period_end: next.period_end, days: String(next.days) };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Registrar factura</h1>
      <p className="text-sm text-muted-foreground">Sube una foto para obtener una sugerencia editable o registra los datos manualmente.</p>

      <Card className="max-w-xl">
        <CardTitle>Importar desde una foto</CardTitle>
        <CardDescription>La imagen se usa para extraer los campos de esta factura y no se conserva en la interfaz.</CardDescription>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            {ocr.isPending ? "Analizando…" : "Seleccionar foto"}
            <input type="file" accept="image/*" className="sr-only" onChange={selectFile} disabled={ocr.isPending} />
          </label>
          <span className="text-xs text-muted-foreground">JPG, PNG o HEIC</span>
        </div>
        {ocr.error ? <p role="alert" className="mt-3 text-sm text-red-600">{ocr.error.message}</p> : null}
      </Card>

      {draft ? (
        <Card className="max-w-xl">
          <CardTitle>Revisa la sugerencia</CardTitle>
          <CardDescription>OCR es una sugerencia. Revisa y corrige todos los campos antes de guardar la factura.</CardDescription>
          {draft.warnings.length > 0 ? (
            <div role="alert" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <strong>Advertencias</strong>
              <ul className="mt-1 list-disc pl-5">{draft.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            </div>
          ) : null}
          <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
            {OCR_FIELDS.map(({ key, label }) => (
              <div key={key} className="flex justify-between rounded border border-border px-2 py-1">
                <span>{label}</span><span className="text-muted-foreground">{confidenceLabel[draft[key].confidence]}</span>
              </div>
            ))}
          </div>
          {draft.raw_text_excerpt ? <p className="mt-3 text-xs text-muted-foreground">Texto detectado: {draft.raw_text_excerpt}</p> : null}
        </Card>
      ) : null}

      <QueryState isLoading={bills.isLoading} error={null}>
        <div>
          {!manual && !draft ? <Button type="button" variant="outline" onClick={() => setManual(true)}>Registrar manualmente</Button> : null}
          {(manual || draft) ? (
            <div className="mt-4">
              {manual && !draft ? <h2 className="mb-3 text-lg font-semibold">Entrada manual</h2> : null}
              <BillForm
                key={draft ? "ocr" : last?.id ?? "first"}
                initial={initial}
                submitLabel="Confirmar y guardar factura"
                pending={create.isPending}
                serverError={create.error?.message}
                onSubmit={(value) => create.mutate(value, { onSuccess: () => router.push("/dashboard") })}
                onCancel={() => router.push("/bills")}
              />
            </div>
          ) : null}
        </div>
      </QueryState>
    </div>
  );
}
