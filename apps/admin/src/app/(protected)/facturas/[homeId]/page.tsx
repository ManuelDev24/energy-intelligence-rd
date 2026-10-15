"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { Empty, ErrorView, Forbidden, Loading } from "@/components/StateViews";
import { ScrollRegion } from "@/components/ScrollRegion";
import { controlStyle } from "@/lib/controls";
import { BILLS_PAGE_SIZE, formatKwh, formatMoney, homeIdProblem, ocrLabel, sourceLabel, type AdminHomeBillsPage } from "@/lib/bills";

type State = { status: "loading" } | { status: "ok"; page: AdminHomeBillsPage } | { status: "forbidden" } | { status: "missing" } | { status: "error"; message: string };
const day = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");
const yes = (v: boolean) => (v ? "Sí" : "No");

export default function FacturasDeViviendaPage() {
  const params = useParams<{ homeId: string }>();
  const id = homeIdProblem(params.homeId ?? "") === null ? params.homeId : null;
  const [offset, setOffset] = useState(0);
  const [state, setState] = useState<State>({ status: "loading" });
  const load = useCallback(async () => {
    if (!id) { setState({ status: "missing" }); return; }
    setState({ status: "loading" });
    try { setState({ status: "ok", page: await apiFetch<AdminHomeBillsPage>(`/api/v1/admin/homes/${id}/bills?limit=${BILLS_PAGE_SIZE}&offset=${offset}`) }); }
    catch (err) {
      if (err instanceof ApiError && err.status === 403) setState({ status: "forbidden" });
      else if (err instanceof ApiError && err.status === 404) setState({ status: "missing" });
      else setState({ status: "error", message: err instanceof Error ? err.message : "Error desconocido" });
    }
  }, [id, offset]);
  useEffect(() => { void load(); }, [load]);

  if (state.status === "forbidden") return <Forbidden heading="Facturas de la vivienda" onRetry={load} />;
  if (state.status === "loading") return <Loading />;
  if (state.status === "error") return <ErrorView message={state.message} onRetry={load} />;
  if (state.status === "missing") {
    return <section><h1>Facturas de la vivienda</h1><p role="alert">Esta vivienda no existe.</p><Link href="/facturas">Volver a facturas</Link></section>;
  }
  const { page } = state;
  return (
    <section>
      <p><Link href="/facturas">← Facturas</Link></p>
      <h1>Facturas de la vivienda</h1>
      <p style={{ color: "#555", maxWidth: "70ch" }}>
        Solo lectura. Abrir esta lista queda registrado en la auditoría. Se muestran periodo, consumo, monto, origen y qué datos tiene cada factura;
        nunca el nombre ni la dirección de la vivienda, quién la posee ni el contenido de los documentos.
      </p>
      {page.items.length === 0 ? <Empty>Esta vivienda no tiene facturas.</Empty> : (
        <>
          <ScrollRegion label="Facturas de la vivienda"><table>
            <caption style={{ textAlign: "left", padding: "4px 0" }}>Mostrando {offset + 1}–{offset + page.items.length} de {page.total}</caption>
            <thead><tr><th scope="col">Periodo</th><th scope="col">Días</th><th scope="col">Consumo</th><th scope="col">Monto</th><th scope="col">Origen</th><th scope="col">Fecha límite</th><th scope="col">Pagada</th><th scope="col">Lecturas</th><th scope="col">Original</th><th scope="col">OCR</th></tr></thead>
            <tbody>
              {page.items.map((b) => (
                <tr key={b.id}>
                  <td>{day(b.period_start)} – {day(b.period_end)}</td><td>{b.days}</td><td>{formatKwh(b.kwh)}</td><td>{formatMoney(b.amount_dop)}</td>
                  <td>{sourceLabel(b.source)}</td><td>{day(b.due_date)}</td><td>{yes(b.paid)}</td><td>{yes(b.has_readings)}</td><td>{yes(b.has_document)}</td><td>{ocrLabel(b.ocr_status)}</td>
                </tr>
              ))}
            </tbody>
          </table></ScrollRegion>
          <nav aria-label="Paginación de facturas" style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button style={controlStyle} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - BILLS_PAGE_SIZE))}>Anterior</button>
            <button style={controlStyle} disabled={offset + BILLS_PAGE_SIZE >= page.total} onClick={() => setOffset(offset + BILLS_PAGE_SIZE)}>Siguiente</button>
          </nav>
        </>
      )}
    </section>
  );
}
