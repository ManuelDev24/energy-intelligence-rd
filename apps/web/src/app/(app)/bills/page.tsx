"use client";

import Link from "next/link";
import { QueryState } from "@/components/query-state";
import { Badge } from "@/components/ui/badge";
import { useBills } from "@/lib/api/hooks";
import { formatDop, formatNumber, formatPeriod } from "@/lib/format";
import { useSession } from "@/lib/session";

export default function BillsPage() {
  const { homeId } = useSession();
  const { data, isLoading, error } = useBills(homeId ?? "");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Facturas</h1>
        <Link
          href="/bills/new"
          className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Registrar factura
        </Link>
      </div>
      <QueryState isLoading={isLoading} error={error}>
        {data && data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay facturas registradas.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data?.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/bills/${b.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-4 hover:bg-muted"
                >
                  <span className="font-medium">{formatPeriod(b.period_start, b.period_end)}</span>
                  <span className="flex items-center gap-3 text-sm text-muted-foreground">
                    {formatNumber(b.kwh)} kWh · {formatDop(b.amount_dop)}
                    <Badge>{b.source === "seed" ? "demo" : "manual"}</Badge>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </div>
  );
}
