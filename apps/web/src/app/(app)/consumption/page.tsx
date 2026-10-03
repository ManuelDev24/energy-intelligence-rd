"use client";

import { QueryState } from "@/components/query-state";
import { Badge } from "@/components/ui/badge";
import { useBills } from "@/lib/api/hooks";
import { formatDop, formatNumber, formatPeriod } from "@/lib/format";
import { useSession } from "@/lib/session";

export default function ConsumptionPage() {
  const { homeId } = useSession();
  const { data, isLoading, error } = useBills(homeId ?? "");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Consumo</h1>
      <p className="text-sm text-muted-foreground">
        Consumo facturado por período, tal como lo registra la factura (resolución mensual).
      </p>
      <QueryState isLoading={isLoading} error={error}>
        {data && data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay facturas registradas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Período</th>
                  <th className="py-2 pr-4 font-medium">kWh</th>
                  <th className="py-2 pr-4 font-medium">Monto</th>
                  <th className="py-2 font-medium">Fuente</th>
                </tr>
              </thead>
              <tbody>
                {data?.map((b) => (
                  <tr key={b.id} className="border-b border-border">
                    <td className="py-2 pr-4">{formatPeriod(b.period_start, b.period_end)}</td>
                    <td className="py-2 pr-4">{formatNumber(b.kwh)}</td>
                    <td className="py-2 pr-4">{formatDop(b.amount_dop)}</td>
                    <td className="py-2">
                      <Badge>{b.source === "seed" ? "demo" : "manual"}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryState>
    </div>
  );
}
