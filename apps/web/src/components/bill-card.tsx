import Link from "next/link";
import type { Bill } from "@/lib/api/schemas";
import { formatDop, formatMetric, formatPeriod } from "@/lib/format";
import { Badge } from "./ui/badge";

/** ERD-UI-KIT: factura en una lista. Enlace al detalle; muestra solo los datos de la factura (kWh, monto, origen). */
export function BillCard({ bill }: { bill: Pick<Bill, "id" | "period_start" | "period_end" | "kwh" | "amount_dop" | "source"> }) {
  return (
    <Link
      href={`/bills/${bill.id}`}
      className="flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background p-4 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span className="font-medium">{formatPeriod(bill.period_start, bill.period_end)}</span>
      <span className="flex items-center gap-3 text-sm tabular-nums text-muted-foreground">
        {formatMetric(bill.kwh, "kWh")} · {formatDop(bill.amount_dop)}
        <Badge>{bill.source === "seed" ? "demo" : "manual"}</Badge>
      </span>
    </Link>
  );
}
