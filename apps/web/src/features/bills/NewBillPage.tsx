"use client";

import { suggestNextPeriod } from "@energyrd/core";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ChangeEvent } from "react";
import { isOcrActive } from "@energyrd/api-contracts";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { BillForm } from "@/components/bill-form";
import { QueryState } from "@/components/query-state";
import { OCR_SLOW_AFTER_MS, useBillOcr, useBills, useCreateBill } from "@/lib/api/hooks";
import { emptyBillForm } from "@/lib/bill-form";
import { OCR_FIELDS, ocrDraftToBillForm, ocrErrorText } from "@/lib/bill-ocr";
import { userMessage } from "@/lib/api/errors";
import { useSession } from "@/lib/session";

const confidenceLabel = { high: "Alta", inferred: "Inferida", none: "No detectada" } as const;
const methodLabel = { text_layer: "Leído del texto del PDF", ocr: "Leído con reconocimiento óptico (OCR)", mixed: "Leído del texto del PDF y con OCR" } as const;

export default function NewBillPage() {
  const router = useRouter();
  const { homeId } = useSession();
  const create = useCreateBill(homeId ?? "");
  const ocr = useBillOcr(homeId ?? "");
  const bills = useBills(homeId ?? "");
  const [manual, setManual] = useState(false);
  const [slow, setSlow] = useState(false);
  const last = [...(bills.data ?? [])].sort((a, b) => b.period_end.localeCompare(a.period_end))[0];
  const next = suggestNextPeriod(last ?? null);
  const job = ocr.job;
  const active = ocr.start.isPending || ocr.retry.isPending || (job !== null && isOcrActive(job));
  const draft = job?.status === "done" ? job.draft : null;
  const failed = job?.status === "failed";

  // Si la lectura tarda más de lo normal (p. ej. no hay un worker activo) se avisa, sin cortar la espera.
  useEffect(() => {
    // Regla nueva (eslint-plugin-react-hooks@7, experimental "set-state-in-effect"): resetea el
    // aviso de lectura lenta en cada cambio de `active`/`ocr.startedAt`; comportamiento existente.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSlow(false);
    if (!active || !ocr.startedAt) return;
    const timer = setTimeout(() => setSlow(true), Math.max(0, OCR_SLOW_AFTER_MS - (Date.now() - ocr.startedAt)));
    return () => clearTimeout(timer);
  }, [active, ocr.startedAt]);

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    ocr.reset();
    ocr.start.mutate(file);
    event.target.value = "";
  }

  const initial = draft
    ? ocrDraftToBillForm(draft)
    : { ...emptyBillForm, period_start: next.period_start, period_end: next.period_end, days: String(next.days) };
  const startError = ocr.start.error ?? ocr.retry.error;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Registrar factura</h1>
      <p className="text-sm text-muted-foreground">Sube una foto o un PDF para obtener una sugerencia editable o registra los datos manualmente.</p>

      <Card className="max-w-xl">
        <CardTitle>Importar desde una foto o un PDF</CardTitle>
        <CardDescription>
          El archivo se guarda cifrado y se asocia a la factura que confirmes. Si no la confirmas, se elimina automáticamente.
        </CardDescription>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 focus-within:outline-none focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2">
            {active ? "Analizando…" : "Seleccionar foto o PDF"}
            <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={selectFile} disabled={active} />
          </label>
          <span className="text-xs text-muted-foreground">JPG, PNG, WEBP, HEIC o PDF</span>
        </div>
        {active ? (
          <div role="status" className="mt-3 text-sm">
            <p>Analizando tu factura… puede tardar unos segundos. No cierres esta página.</p>
            {slow ? (
              <p className="mt-1 text-amber-800">
                Está tardando más de lo normal. Puedes seguir esperando o <button type="button" className="underline" onClick={() => setManual(true)}>registrar la factura manualmente</button>.
              </p>
            ) : null}
          </div>
        ) : null}
        {startError ? <p role="alert" className="mt-3 text-sm text-danger">{userMessage(startError, "ocr")}</p> : null}
        {failed ? (
          <div role="alert" className="mt-3 text-sm text-danger">
            <p>{ocrErrorText(job?.error_code)}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {job?.error_code === "engine_error" ? (
                <Button type="button" variant="outline" onClick={() => ocr.retry.mutate()} disabled={ocr.retry.isPending}>Reintentar</Button>
              ) : null}
              <Button type="button" variant="outline" onClick={() => setManual(true)}>Registrar manualmente</Button>
            </div>
          </div>
        ) : null}
      </Card>

      {draft && job ? (
        <Card className="max-w-xl">
          <CardTitle>Revisa la sugerencia</CardTitle>
          <CardDescription>
            La lectura es una sugerencia. Revisa y corrige todos los campos antes de guardar la factura.
            {job.method ? ` ${methodLabel[job.method]}${job.pages_total && job.pages_total > 1 ? ` (${job.pages_read} de ${job.pages_total} páginas)` : ""}.` : ""}
          </CardDescription>
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
          {!manual && !draft && !failed ? <Button type="button" variant="outline" onClick={() => setManual(true)}>Registrar manualmente</Button> : null}
          {(manual || draft) ? (
            <div className="mt-4">
              {manual && !draft ? <h2 className="mb-3 text-lg font-semibold">Entrada manual</h2> : null}
              <BillForm
                key={draft ? "ocr" : last?.id ?? "first"}
                initial={initial}
                submitLabel="Confirmar y guardar factura"
                pending={create.isPending}
                serverError={create.error ? userMessage(create.error, "bill-save") : undefined}
                onSubmit={(value) => create.mutate(draft && job ? { ...value, document_id: job.document_id } : value, { onSuccess: () => router.push("/dashboard") })}
                onCancel={() => router.push("/bills")}
              />
            </div>
          ) : null}
        </div>
      </QueryState>
    </div>
  );
}
