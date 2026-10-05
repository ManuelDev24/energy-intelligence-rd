"use client";

import { Receipt } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { KwhTrendChart } from "@/components/kwh-trend-chart";
import { QueryState } from "@/components/query-state";
import { Badge } from "@/components/ui/badge";
import { useBills } from "@/lib/api/hooks";
import { formatDop, formatMetric, formatPeriod } from "@/lib/format";
import { useSession } from "@/lib/session";

export default function BillsPage() {
  const { homeId } = useSession();
  const { data, isLoading, error, refetch } = useBills(homeId ?? "");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Facturas</h1>
        <Link
          href="/bills/new"
          className="inline-flex h-11 items-center gap-1 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          Registrar factura
        </Link>
      </div>
      <QueryState isLoading={isLoading} error={error} onRetry={() => void refetch()}>
        {data && data.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Aún no hay facturas registradas"
            hint="Copia los kWh y el monto (RD$) de tu factura de luz para empezar."
          />
        ) : (
          <>
            {data ? <KwhTrendChart bills={data} /> : null}
            <ul className="flex flex-col gap-2">
              {data?.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/bills/${b.id}`}
                    className="flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background p-4 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <span className="font-medium">{formatPeriod(b.period_start, b.period_end)}</span>
                    <span className="flex items-center gap-3 text-sm tabular-nums text-muted-foreground">
                      {formatMetric(b.kwh, "kWh")} · {formatDop(b.amount_dop)}
                      <Badge>{b.source === "seed" ? "demo" : "manual"}</Badge>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </QueryState>
    </div>
  );
}
