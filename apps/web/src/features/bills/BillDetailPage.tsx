"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { BillForm } from "@/components/bill-form";
import { QueryState } from "@/components/query-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { billDetailUnavailable, userMessage } from "@/lib/api/errors";
import { useBill, useBillItems, useDeleteBill, useUpdateBill } from "@/lib/api/hooks";
import type { Bill } from "@/lib/api/schemas";
import { formatDop, formatNumber, formatPeriod } from "@/lib/format";
import { useSession } from "@/lib/session";
import { BillAssessmentSection } from "./BillAssessmentSection";
import { BillItemsSection } from "./BillItemsSection";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function toFormValues(b: Bill) {
  return {
    period_start: b.period_start,
    period_end: b.period_end,
    kwh: b.kwh,
    amount_dop: b.amount_dop,
    days: String(b.days),
    reading_previous: b.reading_previous ?? "",
    reading_current: b.reading_current ?? "",
  };
}

export default function BillDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { homeId, authEnabled } = useSession();
  const home = homeId ?? "";
  const { data, isLoading, error } = useBill(home, id);
  // ERD-BILL-02: en el piloto sin estos endpoints, ambas secciones quedan en "no disponible".
  const items = useBillItems(home, id);
  const itemsUnavailable = billDetailUnavailable(items.error, authEnabled);
  const update = useUpdateBill(home, id);
  const remove = useDeleteBill(home);
  const [editing, setEditing] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Detalle de factura</h1>
      <QueryState isLoading={isLoading} error={error}>
        {data && editing ? (
          <BillForm
            initial={toFormValues(data)}
            submitLabel="Guardar cambios"
            pending={update.isPending}
            serverError={update.error ? userMessage(update.error, "bill-save") : undefined}
            onSubmit={(value) => update.mutate(value, { onSuccess: () => router.push("/bills") })}
            onCancel={() => setEditing(false)}
          />
        ) : data ? (
          <>
            <Card className="max-w-xl">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-semibold">{formatPeriod(data.period_start, data.period_end)}</span>
                <Badge>{data.source === "seed" ? "demo" : "manual"}</Badge>
              </div>
              <dl>
                <Row label="Consumo" value={`${formatNumber(data.kwh)} kWh`} />
                <Row label="Monto" value={formatDop(data.amount_dop)} />
                <Row label="Días facturados" value={String(data.days)} />
                {data.reading_previous !== null ? (
                  <Row label="Lectura anterior" value={formatNumber(data.reading_previous)} />
                ) : null}
                {data.reading_current !== null ? (
                  <Row label="Lectura actual" value={formatNumber(data.reading_current)} />
                ) : null}
              </dl>
            </Card>
            {remove.error ? (
              <p role="alert" className="text-sm text-red-600">
                {userMessage(remove.error, "bill-delete")}
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => router.push("/bills")}>
                Volver
              </Button>
              {data.source === "manual" ? (
                <>
                  <Button onClick={() => setEditing(true)}>Editar</Button>
                  <Button
                    variant="outline"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (window.confirm("¿Eliminar esta factura?")) {
                        remove.mutate(data.id, { onSuccess: () => router.push("/bills") });
                      }
                    }}
                  >
                    Eliminar
                  </Button>
                </>
              ) : null}
            </div>
            <BillItemsSection homeId={home} billId={data.id} query={items} unavailable={itemsUnavailable} />
            {itemsUnavailable ? null : <BillAssessmentSection homeId={home} billId={data.id} authEnabled={authEnabled} />}
          </>
        ) : null}
      </QueryState>
    </div>
  );
}
