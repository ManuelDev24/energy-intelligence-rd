"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { ErrorView, Forbidden, Loading } from "@/components/StateViews";
import { formatDate } from "@/lib/ocr";
import { homeDetailRows, type AdminHomeDetail } from "@/lib/homes";

type State = { status: "loading" } | { status: "ok"; home: AdminHomeDetail } | { status: "forbidden" } | { status: "missing" } | { status: "error"; message: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function ViviendaPage() {
  const params = useParams<{ id: string }>();
  const id = UUID.test(params.id ?? "") ? params.id : null;
  const [state, setState] = useState<State>({ status: "loading" });
  const load = useCallback(async () => {
    if (!id) { setState({ status: "missing" }); return; }
    setState({ status: "loading" });
    try { setState({ status: "ok", home: await apiFetch<AdminHomeDetail>(`/api/v1/admin/homes/${id}`) }); }
    catch (err) {
      if (err instanceof ApiError && err.status === 403) setState({ status: "forbidden" });
      else if (err instanceof ApiError && err.status === 404) setState({ status: "missing" });
      else setState({ status: "error", message: err instanceof Error ? err.message : "Error desconocido" });
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  if (state.status === "forbidden") return <Forbidden heading="Vivienda" onRetry={load} />;
  if (state.status === "loading") return <Loading />;
  if (state.status === "error") return <ErrorView message={state.message} onRetry={load} />;
  if (state.status === "missing") {
    return <section><h1>Vivienda</h1><p role="alert">Esta vivienda no existe.</p><Link href="/viviendas">Volver a viviendas</Link></section>;
  }
  const rows = homeDetailRows(state.home, formatDate);
  return (
    <section>
      <p><Link href="/viviendas">← Viviendas</Link></p>
      <h1>Vivienda</h1>
      <p style={{ color: "#555", maxWidth: "70ch" }}>
        Solo lectura. Abrir esta ficha queda registrado en la auditoría. No incluye el nombre, la dirección, los miembros ni el contenido de facturas,
        lecturas o documentos: para resolver un caso pide a la persona que lo comparta desde su cuenta.
      </p>
      <dl style={{ display: "grid", gridTemplateColumns: "minmax(0, max-content) minmax(0, 1fr)", gap: "6px 16px" }}>
        {rows.map(([term, value]) => (
          <div key={term} style={{ display: "contents" }}>
            <dt style={{ fontWeight: 600 }}>{term}</dt><dd style={{ margin: 0, overflowWrap: "anywhere" }}>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
