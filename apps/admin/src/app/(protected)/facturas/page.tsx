"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { ErrorView, Forbidden, Loading } from "@/components/StateViews";
import { ScrollRegion } from "@/components/ScrollRegion";
import { controlStyle, fillStyle } from "@/lib/controls";
import { nf } from "@/lib/overview";
import { homeIdProblem, qualityRows, SUMMARY_DAYS, type BillsSummary } from "@/lib/bills";

type State = { status: "loading" } | { status: "ok"; data: BillsSummary } | { status: "forbidden" } | { status: "error"; message: string };
const labelStyle = { display: "grid", gap: 4, fontSize: 14 } as const;
const grid = { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", margin: "0 0 16px", padding: 0, listStyle: "none" } as const;
const card = { border: "1px solid #ddd", borderRadius: 8, padding: 12, minWidth: 0 } as const;

export default function FacturasPage() {
  const router = useRouter();
  const [days, setDays] = useState<number>(30);
  const [homeId, setHomeId] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try { setState({ status: "ok", data: await apiFetch<BillsSummary>(`/api/v1/admin/bills/summary?days=${days}`) }); }
    catch (err) {
      if (err instanceof ApiError && err.status === 403) setState({ status: "forbidden" });
      else setState({ status: "error", message: err instanceof Error ? err.message : "Error desconocido" });
    }
  }, [days]);
  useEffect(() => { void load(); }, [load]);

  if (state.status === "forbidden") return <Forbidden heading="Facturas" onRetry={load} />;

  function open(event: FormEvent) {
    event.preventDefault();
    const issue = homeIdProblem(homeId);
    setProblem(issue);
    if (!issue) router.push(`/facturas/${homeId.trim().toLowerCase()}`);
  }

  return (
    <section>
      <h1>Facturas</h1>
      <p style={{ color: "#555", maxWidth: "70ch" }}>
        Calidad de los datos de facturas de todas las viviendas: solo conteos, nunca importes ni quién es cada persona. Para ver las facturas de una
        vivienda concreta hace falta su identificador completo; esa consulta queda en la auditoría.
      </p>
      <form onSubmit={open} aria-label="Facturas de una vivienda" style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", alignItems: "end", marginBottom: 16 }}>
        <label style={labelStyle}>Identificador de la vivienda
          <input style={fillStyle} value={homeId} maxLength={36} autoComplete="off" aria-invalid={problem ? true : undefined} aria-describedby={problem ? "home-problem" : undefined}
                 onChange={(e) => { setHomeId(e.target.value); setProblem(null); }} />
        </label>
        <div><button type="submit" style={controlStyle}>Ver facturas</button></div>
      </form>
      {problem ? <p id="home-problem" role="alert" style={{ color: "#b00020" }}>{problem}</p> : null}
      <label style={{ ...labelStyle, maxWidth: 240, marginBottom: 12 }}>Ventana de «recientes»
        <select style={fillStyle} value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {SUMMARY_DAYS.map((d) => <option key={d} value={d}>Últimos {d} días</option>)}
        </select>
      </label>
      {state.status === "loading" ? <Loading /> : state.status === "error" ? <ErrorView message={state.message} onRetry={load} /> : (
        <>
          <ul aria-label="Totales de facturas" style={grid}>
            {[["Facturas", state.data.total], [`Nuevas en ${state.data.days} días`, state.data.recent], ["Viviendas con facturas", state.data.homes_with_bills],
              ["Manuales", state.data.manual], ["De demostración", state.data.seed]].map(([label, value]) => (
              <li key={String(label)} style={card}>
                <p style={{ margin: 0, fontSize: 13, color: "#555" }}>{label}</p>
                <p style={{ margin: "4px 0 0", fontSize: 26, fontWeight: 700 }}>{nf(Number(value))}</p>
              </li>
            ))}
          </ul>
          {state.data.total === 0 ? <p role="status" style={{ color: "#666" }}>Todavía no hay facturas: no hay porcentajes que calcular.</p> : null}
          <h2>Completitud de los datos</h2>
          <ScrollRegion label="Completitud de facturas"><table>
            <thead><tr><th scope="col">Dato</th><th scope="col">Facturas</th><th scope="col">Porcentaje</th><th scope="col">Para qué sirve</th></tr></thead>
            <tbody>{qualityRows(state.data).map((r) => <tr key={r.label}><td>{r.label}</td><td>{nf(r.value)}</td><td>{r.share}</td><td>{r.note}</td></tr>)}</tbody>
          </table></ScrollRegion>
          <h2>Lectura de originales (OCR)</h2>
          <ScrollRegion label="Estado del OCR"><table>
            <thead><tr><th scope="col">Estado</th><th scope="col">Originales</th></tr></thead>
            <tbody>
              <tr><td>En cola o procesando</td><td>{nf(state.data.ocr_pending)}</td></tr>
              <tr><td>Listos</td><td>{nf(state.data.ocr_done)}</td></tr>
              <tr><td>Fallidos</td><td>{nf(state.data.ocr_failed)}</td></tr>
            </tbody>
          </table></ScrollRegion>
        </>
      )}
    </section>
  );
}
