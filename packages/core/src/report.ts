import type { EnergyReportOut } from '@energyrd/api-contracts';
import { fmtDate, fmtDop, fmtKwh, fmtNumber, fmtPct, fmtPeriod } from './format';
import { QUALITY } from './quality';
import { RECOMMENDATION_DIFFICULTY, RECOMMENDATION_IMPACT } from './recommendations';

/**
 * ERD-RPT-01: presentación del informe energético, igual en web (vista imprimible) y móvil (compartir). Solo formato y etiquetas:
 * cada cifra ya trae su calidad desde la API y aquí nunca se recalcula ni se redondea de otra forma.
 */
export interface ReportLine { label: string; value: string; quality: 'REAL' | 'ESTIMATED' | 'PROJECTED' | null }
export interface ReportSection { title: string; lines: ReportLine[]; empty?: string }
export interface EnergyReportView {
  title: string;
  subtitle: string;
  sections: ReportSection[];
  sources: string[];
  notes: string[];
  generated: string;
}

const qualityTag = (q: ReportLine['quality']) => (q && q !== 'REAL' ? ` (${QUALITY[q].label.toLowerCase()})` : '');

export function energyReportView(r: EnergyReportOut): EnergyReportView {
  const { totals } = r;
  const summary: ReportLine[] = totals.kwh && totals.amount_dop ? [
    { label: 'Facturas en el período', value: String(totals.bills_count), quality: 'REAL' },
    { label: 'Consumo total', value: fmtKwh(totals.kwh.value), quality: totals.kwh.quality },
    { label: 'Gasto total', value: fmtDop(totals.amount_dop.value), quality: totals.amount_dop.quality },
    ...(totals.avg_price_per_kwh ? [{ label: 'Precio medio', value: `${fmtDop(totals.avg_price_per_kwh.value)} por kWh`, quality: totals.avg_price_per_kwh.quality }] : []),
    ...(totals.avg_kwh_per_bill ? [{ label: 'Consumo medio por factura', value: fmtKwh(totals.avg_kwh_per_bill.value), quality: totals.avg_kwh_per_bill.quality }] : []),
    ...(r.peak_bill ? [{ label: 'Factura de mayor consumo', value: `${fmtPeriod(r.peak_bill.period_start, r.peak_bill.period_end)}: ${fmtKwh(r.peak_bill.kwh.value)}`, quality: r.peak_bill.kwh.quality }] : []),
  ] : [];
  const sections: ReportSection[] = [
    { title: 'Resumen', lines: summary, empty: 'No hay facturas registradas en este período.' },
  ];
  if (r.comparison) {
    const c = r.comparison;
    sections.push({ title: `Frente al período anterior (${fmtPeriod(c.previous_from, c.previous_to)})`, lines: [
      { label: 'Consumo anterior', value: fmtKwh(c.previous_kwh.value), quality: c.previous_kwh.quality },
      ...(c.kwh_pct ? [{ label: 'Variación del consumo', value: fmtPct(c.kwh_pct.value), quality: c.kwh_pct.quality }] : []),
      { label: 'Gasto anterior', value: fmtDop(c.previous_amount_dop.value), quality: c.previous_amount_dop.quality },
      ...(c.amount_pct ? [{ label: 'Variación del gasto', value: fmtPct(c.amount_pct.value), quality: c.amount_pct.quality }] : []),
    ] });
  }
  if (r.bills.length) {
    sections.push({ title: 'Facturas', lines: r.bills.map(b => ({ label: fmtPeriod(b.period_start, b.period_end), value: `${fmtKwh(b.kwh.value)} · ${fmtDop(b.amount_dop.value)}`, quality: b.kwh.quality })) });
  }
  if (r.equipment.length) {
    sections.push({ title: 'Equipos que más pesan (estimado)', lines: r.equipment.map(e => ({ label: e.room ? `${e.name} (${e.room})` : e.name, value: `${fmtNumber(e.share_pct.value, 0)} % · ≈ ${fmtKwh(e.monthly_kwh.value)} al mes`, quality: e.share_pct.quality })) });
  }
  if (r.recommendations.length) {
    sections.push({ title: 'Cómo ahorrar (estimado)', lines: r.recommendations.map(x => ({
      label: x.title,
      value: [x.savings_kwh_month ? `≈ ${fmtKwh(x.savings_kwh_month.value)} al mes` : null, RECOMMENDATION_DIFFICULTY[x.difficulty], x.impact ? RECOMMENDATION_IMPACT[x.impact] : null].filter(Boolean).join(' · '),
      quality: x.savings_kwh_month ? x.savings_kwh_month.quality : null })) });
  }
  if (r.goal) {
    sections.push({ title: 'Tu meta mensual', lines: [
      ...(r.goal.monthly_kwh ? [{ label: 'Meta de consumo', value: fmtKwh(r.goal.monthly_kwh), quality: null }] : []),
      ...(r.goal.monthly_amount_rd ? [{ label: 'Meta de gasto', value: fmtDop(r.goal.monthly_amount_rd), quality: null }] : []),
    ] });
  }
  const place = [r.home.municipality, r.home.province].filter(Boolean).join(', ');
  return {
    title: 'Informe energético',
    subtitle: `${r.home.name} · ${r.home.distributor}${place ? ` · ${place}` : ''} · ${fmtPeriod(r.period.period_from, r.period.period_to)}`,
    sections,
    sources: r.sources.map(s => `${s.label} — ${QUALITY[s.quality].label.toLowerCase()}`),
    notes: r.notes,
    generated: `Generado el ${fmtDate(r.generated_at.slice(0, 10))}`,
  };
}

/** Texto plano del informe (para compartir desde el teléfono o copiar): mismas etiquetas de calidad que la pantalla. */
export function energyReportToText(r: EnergyReportOut): string {
  const v = energyReportView(r);
  const out = [v.title, v.subtitle, ''];
  for (const s of v.sections) {
    out.push(s.title.toUpperCase());
    if (!s.lines.length) out.push(s.empty ?? '—');
    for (const l of s.lines) out.push(`• ${l.label}: ${l.value}${qualityTag(l.quality)}`);
    out.push('');
  }
  if (v.sources.length) out.push('FUENTES', ...v.sources.map(x => `• ${x}`), '');
  out.push('NOTAS', ...v.notes.map(x => `• ${x}`), '', v.generated);
  return out.join('\n');
}
