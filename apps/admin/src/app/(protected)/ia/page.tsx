"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { Empty, ErrorView, Forbidden, Loading } from "@/components/StateViews";
import { ScrollRegion } from "@/components/ScrollRegion";
import { fillStyle } from "@/lib/controls";
import { barWidth, isPersonId, ms, nfs, PROVIDER_TEXT, problemRate, satisfaction, shortSubject, statusText, usd, WINDOWS, type AiUsage } from "@/lib/ai";

type State = { status: "loading" } | { status: "ok"; data: AiUsage } | { status: "forbidden" } | { status: "error"; message: string };
const grid = { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", margin: "0 0 16px", padding: 0, listStyle: "none" } as const;
const card = { border: "1px solid #ddd", borderRadius: 8, padding: 12, minWidth: 0 } as const;
const day = (iso: string) => iso.split("-").reverse().join("/");

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <li style={card}>
      <p style={{ margin: 0, fontSize: 13, color: "#555" }}>{label}</p>
      <p style={{ margin: "4px 0 0", fontSize: 26, fontWeight: 700 }}>{value}</p>
      {note ? <p style={{ margin: "4px 0 0", fontSize: 12, color: "#555" }}>{note}</p> : null}
    </li>
  );
}

export default function IaPage() {
  const [days, setDays] = useState<number>(14);
  const [state, setState] = useState<State>({ status: "loading" });
  const load = useCallback(async () => {
    setState({ status: "loading" });
    try { setState({ status: "ok", data: await apiFetch<AiUsage>(`/api/v1/admin/ai/usage?days=${days}`) }); }
    catch (err) {
      if (err instanceof ApiError && err.status === 403) setState({ status: "forbidden" });
      else setState({ status: "error", message: err instanceof Error ? err.message : "Error desconocido" });
    }
  }, [days]);
  useEffect(() => { void load(); }, [load]);

  if (state.status === "forbidden") return <Forbidden heading="IA (Copilot)" onRetry={load} />;
  return (
    <section>
      <h1>IA (Copilot)</h1>
      <p style={{ color: "#555", maxWidth: "70ch" }}>
        Supervisión del Energy Copilot con cifras agregadas: uso, tokens, latencia, errores, herramientas y valoraciones. No se muestra el texto de las conversaciones,
        sus títulos ni a qué vivienda pertenecen; las personas aparecen solo por un identificador. Cada consulta queda en la auditoría.
      </p>
      <label style={{ display: "grid", gap: 4, fontSize: 14, maxWidth: 240, marginBottom: 12 }}>Periodo
        <select style={fillStyle} value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {WINDOWS.map((d) => <option key={d} value={d}>Últimos {d} días</option>)}
        </select>
      </label>
      {state.status === "loading" ? <Loading /> : state.status === "error" ? <ErrorView message={state.message} onRetry={load} /> : (() => {
        const u = state.data;
        const maxTokens = Math.max(0, ...u.by_day.map((d) => d.tokens));
        return (
          <>
            <ul aria-label="Cifras del Copilot" style={grid}>
              <Stat label="Respuestas" value={nfs(u.assistant_messages)} note={`${nfs(u.conversations)} conversaciones nuevas`} />
              <Stat label="Tokens de entrada" value={nfs(u.input_tokens)} />
              <Stat label="Tokens de salida" value={nfs(u.output_tokens)} />
              <Stat label="Latencia mediana" value={ms(u.latency_p50_ms)} note={`p95: ${ms(u.latency_p95_ms)} (solo respuestas completas)`} />
              <Stat label="Respuestas con problema" value={problemRate(u)} note="error o rechazo sobre el total" />
              <Stat label="Valoración útil" value={satisfaction(u)} note={`${nfs(u.feedback_up)} útiles · ${nfs(u.feedback_down)} no útiles`} />
            </ul>
            {u.assistant_messages === 0 ? <p role="status" style={{ color: "#666" }}>No hay respuestas del Copilot en este periodo: no hay tasas que calcular.</p> : null}

            <h2>Costo estimado</h2>
            {u.cost.configured ? (
              <p>Entrada {usd(u.cost.input_usd)} + salida {usd(u.cost.output_usd)} = <strong>{usd(u.cost.total_usd)}</strong>. Es una estimación con los precios configurados; no reemplaza la factura del proveedor.</p>
            ) : (
              <p role="status">Sin precios configurados: no se estima el costo (no se inventan precios). Define <code>COPILOT_PRICE_INPUT_USD_PER_MTOK</code> y <code>COPILOT_PRICE_OUTPUT_USD_PER_MTOK</code> en el entorno.</p>
            )}

            <h2>Límites vigentes</h2>
            <ScrollRegion label="Límites del Copilot"><table>
              <thead><tr><th scope="col">Ajuste</th><th scope="col">Valor</th></tr></thead>
              <tbody>
                <tr><td>Proveedor</td><td>{PROVIDER_TEXT[u.limits.provider]}</td></tr>
                <tr><td>Modelo</td><td>{u.limits.model}</td></tr>
                <tr><td>Mensajes por persona al día</td><td>{nfs(u.limits.daily_messages_per_user)}</td></tr>
                <tr><td>Tokens por persona al día</td><td>{nfs(u.limits.daily_tokens_per_user)}</td></tr>
                <tr><td>Conversaciones por persona</td><td>{nfs(u.limits.max_conversations_per_user)}</td></tr>
              </tbody>
            </table></ScrollRegion>

            <h2>Uso por día</h2>
            {u.by_day.length === 0 ? <Empty>Sin uso registrado en este periodo.</Empty> : (
              <ScrollRegion label="Uso por día"><table>
                <thead><tr><th scope="col">Día</th><th scope="col">Mensajes</th><th scope="col">Tokens</th><th scope="col">Personas</th><th scope="col">Tokens (barra)</th></tr></thead>
                <tbody>{u.by_day.map((d) => (
                  <tr key={d.day}>
                    <td>{day(d.day)}</td><td>{nfs(d.messages)}</td><td>{nfs(d.tokens)}</td><td>{nfs(d.people)}</td>
                    <td aria-hidden="true"><div style={{ background: "#1f4fbf", height: 10, width: `${barWidth(d.tokens, maxTokens)}%`, minWidth: 4, borderRadius: 3 }} /></td>
                  </tr>
                ))}</tbody>
              </table></ScrollRegion>
            )}

            <h2>Estado de las respuestas</h2>
            {Object.keys(u.by_status).length === 0 ? <Empty>Sin respuestas en este periodo.</Empty> : (
              <ScrollRegion label="Estado de las respuestas"><table>
                <thead><tr><th scope="col">Estado</th><th scope="col">Respuestas</th></tr></thead>
                <tbody>{Object.entries(u.by_status).map(([k, v]) => <tr key={k}><td>{statusText(k)}</td><td>{nfs(v)}</td></tr>)}</tbody>
              </table></ScrollRegion>
            )}

            <h2>Modelos y herramientas</h2>
            {u.by_model.length === 0 && u.tools.length === 0 ? <Empty>Sin datos de modelos ni herramientas.</Empty> : (
              <>
                <ScrollRegion label="Respuestas por modelo"><table>
                  <caption style={{ textAlign: "left" }}>Por modelo</caption>
                  <thead><tr><th scope="col">Modelo</th><th scope="col">Respuestas</th><th scope="col">Tokens de entrada</th><th scope="col">Tokens de salida</th></tr></thead>
                  <tbody>{u.by_model.map((m) => <tr key={m.model}><td>{m.model}</td><td>{nfs(m.messages)}</td><td>{nfs(m.input_tokens)}</td><td>{nfs(m.output_tokens)}</td></tr>)}</tbody>
                </table></ScrollRegion>
                <ScrollRegion label="Herramientas invocadas"><table>
                  <caption style={{ textAlign: "left" }}>Herramientas invocadas</caption>
                  <thead><tr><th scope="col">Herramienta</th><th scope="col">Veces</th></tr></thead>
                  <tbody>{u.tools.map((t) => <tr key={t.name}><td>{t.name}</td><td>{nfs(t.count)}</td></tr>)}</tbody>
                </table></ScrollRegion>
              </>
            )}

            <h2>Personas con más uso</h2>
            {u.top_people.length === 0 ? <Empty>Sin uso por persona en este periodo.</Empty> : (
              <ScrollRegion label="Personas con más uso"><table>
                <thead><tr><th scope="col">Persona (identificador)</th><th scope="col">Mensajes</th><th scope="col">Tokens</th><th scope="col">Días activa</th></tr></thead>
                <tbody>{u.top_people.map((p) => (
                  <tr key={p.subject}>
                    <td>{isPersonId(p.subject) ? <Link href={`/usuarios/${p.subject}`} style={{ display: "inline-block", minHeight: 24, padding: "4px 0" }}>{shortSubject(p.subject)}</Link> : shortSubject(p.subject)}</td>
                    <td>{nfs(p.messages)}</td><td>{nfs(p.tokens)}</td><td>{nfs(p.days_active)}</td>
                  </tr>
                ))}</tbody>
              </table></ScrollRegion>
            )}
            <p style={{ color: "#555", maxWidth: "70ch", marginTop: 16 }}>
              No incluye «conversaciones marcadas» (el producto no tiene ese concepto) ni lectura del contenido de una conversación: eso necesitaría un flujo de
              autorización y auditoría propio.
            </p>
          </>
        );
      })()}
    </section>
  );
}
