"use client";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { ErrorView, Forbidden, Loading } from "@/components/StateViews";
import { ScrollRegion } from "@/components/ScrollRegion";
import { visuallyHidden } from "@/lib/controls";
import { coverageView, kwh, rangeText, rd, SEVERITY_TEXT, STATE_TEXT, worst, type Severity, type TariffsOverview } from "@/lib/tariffs";

type State = { status: "loading" } | { status: "ok"; data: TariffsOverview } | { status: "forbidden" } | { status: "error"; message: string };
const COLORS: Record<Severity, { fg: string; bg: string }> = { ok: { fg: "#0b5d2a", bg: "#e3f4e8" }, warning: { fg: "#7a4a00", bg: "#fff1d6" }, critical: { fg: "#8a0017", bg: "#fde3e7" } };
const day = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");

export default function TarifasPage() {
  const [state, setState] = useState<State>({ status: "loading" });
  const load = useCallback(async () => {
    setState({ status: "loading" });
    try { setState({ status: "ok", data: await apiFetch<TariffsOverview>("/api/v1/admin/tariffs") }); }
    catch (err) {
      if (err instanceof ApiError && err.status === 403) setState({ status: "forbidden" });
      else setState({ status: "error", message: err instanceof Error ? err.message : "Error desconocido" });
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (state.status === "forbidden") return <Forbidden heading="Tarifas" onRetry={load} />;
  return (
    <section>
      <h1>Tarifas</h1>
      <p style={{ color: "#555", maxWidth: "70ch" }}>
        Tarifas publicadas por la SIE y cuánto tiempo cubren. Es información pública y de solo lectura. Si una distribuidora se queda sin tarifa vigente,
        la aplicación no estima costos en RD$ (nunca reutiliza una tarifa vencida). Para cargar una versión nueva se necesita una migración revisada.
      </p>
      {state.status === "loading" ? <Loading /> : state.status === "error" ? <ErrorView message={state.message} onRetry={load} /> : (
        <>
          {worst(state.data.coverage) !== "ok" ? (
            <p role="alert" style={{ background: COLORS[worst(state.data.coverage)].bg, color: COLORS[worst(state.data.coverage)].fg, padding: 12, borderRadius: 8 }}>
              {worst(state.data.coverage) === "critical" ? "Hay distribuidoras sin tarifa vigente: los costos en RD$ no están disponibles para ellas."
                : `Hay tarifas que vencen en menos de ${state.data.warn_days} días y no tienen reemplazo cargado.`}
            </p>
          ) : null}
          <h2>Cobertura hoy ({day(state.data.today)})</h2>
          <ScrollRegion label="Cobertura de tarifas"><table>
            <thead><tr><th scope="col">Distribuidora</th><th scope="col">Tarifa</th><th scope="col">Estado</th><th scope="col">Detalle</th></tr></thead>
            <tbody>{state.data.coverage.map((c) => {
              const v = coverageView(c);
              return (
                <tr key={c.distributor}>
                  <td>{c.distributor}</td><td>{c.tariff_code}</td>
                  <td><span style={{ background: COLORS[v.severity].bg, color: COLORS[v.severity].fg, padding: "2px 8px", borderRadius: 999, fontWeight: 600 }}>{v.label}</span>
                    <span style={visuallyHidden}> ({SEVERITY_TEXT[v.severity]})</span></td>
                  <td>{v.detail}</td>
                </tr>
              );
            })}</tbody>
          </table></ScrollRegion>
          <h2>Versiones cargadas</h2>
          {state.data.versions.length === 0 ? <p role="status" style={{ color: "#666" }}>No hay tarifas cargadas.</p> : state.data.versions.map((t) => (
            <details key={t.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: "8px 12px", margin: "0 0 8px" }}>
              <summary style={{ cursor: "pointer", minHeight: 24 }}>
                {t.distributor} · {t.tariff_code} · {day(t.effective_from)} a {t.effective_to ? day(t.effective_to) : "sin fecha de fin"} · {STATE_TEXT[t.state]}
              </summary>
              <p style={{ margin: "8px 0" }}>
                Fuente: {t.source_url ? <a href={t.source_url} rel="noopener noreferrer" target="_blank">{t.source_resolution}<span style={visuallyHidden}> (abre en una pestaña nueva)</span></a> : t.source_resolution}
                {t.scope_note ? <> · {t.scope_note}</> : null}
              </p>
              {t.flat_all_units_from_kwh ? <p style={{ margin: "0 0 8px" }}>Desde {kwh(t.flat_all_units_from_kwh)} kWh al mes, todos los kWh van al precio del bloque que contiene el consumo.</p> : null}
              <ScrollRegion label={`Cargos fijos ${t.distributor} ${t.tariff_code} ${day(t.effective_from)}`}><table>
                <caption style={{ textAlign: "left" }}>Cargo fijo mensual</caption>
                <thead><tr><th scope="col">Consumo mensual</th><th scope="col">Cargo</th></tr></thead>
                <tbody>{t.fixed_charges.map((f) => <tr key={f.from_kwh}><td>{rangeText(f.from_kwh, f.to_kwh)}</td><td>{rd(f.amount_rd)}</td></tr>)}</tbody>
              </table></ScrollRegion>
              <ScrollRegion label={`Bloques ${t.distributor} ${t.tariff_code} ${day(t.effective_from)}`}><table>
                <caption style={{ textAlign: "left" }}>Precio por kWh</caption>
                <thead><tr><th scope="col">Bloque</th><th scope="col">Precio por kWh</th></tr></thead>
                <tbody>{t.blocks.map((b) => <tr key={b.from_kwh}><td>{rangeText(b.from_kwh, b.to_kwh)}</td><td>{rd(b.price_rd_per_kwh)}</td></tr>)}</tbody>
              </table></ScrollRegion>
            </details>
          ))}
        </>
      )}
    </section>
  );
}
