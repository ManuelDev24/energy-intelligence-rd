'use client';

import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { env } from '@/lib/env';
import { DATA_STATUSES } from '../consumption/types';
import styles from '../consumption/consumption.module.css';
import { loadEnergy, loadHomes, type EnergyBill, type EnergyData } from './api';
import { demoEnergy, demoEnergyHomes } from './fixtures';
import { compareBill, sortBills } from './model';

const number = new Intl.NumberFormat('es-DO', { maximumFractionDigits: 2 });
const period = (bill: EnergyBill) => `${bill.period_start} → ${bill.period_end}`;

export function EnergyDashboard({ initialHomeId = '', initialMode = 'api', onHomeChange, allowModeSwitch = true }: {
  initialHomeId?: string;
  initialMode?: 'api' | 'demo';
  onHomeChange?: (homeId: string) => void;
  allowModeSwitch?: boolean;
} = {}) {
  const id = useId();
  const [mode, setMode] = useState<'api' | 'demo'>(initialMode);
  const [homeId, setHomeId] = useState(initialHomeId);
  const [periodId, setPeriodId] = useState('');
  const homesQuery = useQuery({ queryKey: ['energy-homes', env.NEXT_PUBLIC_API_URL],
    queryFn: ({ signal }) => loadHomes(env.NEXT_PUBLIC_API_URL, signal), enabled: mode === 'api', retry: false });
  const homes = mode === 'demo' ? demoEnergyHomes : homesQuery.data ?? [];
  const home = homes.find(item => item.id === homeId) ?? homes[0];
  const energyQuery = useQuery({ queryKey: ['energy', env.NEXT_PUBLIC_API_URL, home?.id],
    queryFn: ({ signal }) => loadEnergy(env.NEXT_PUBLIC_API_URL, home!.id, signal), enabled: mode === 'api' && !!home, retry: false });
  const data = mode === 'demo' && home ? demoEnergy(home) : energyQuery.data;
  const loading = mode === 'api' && (homesQuery.isPending || (!!home && energyQuery.isPending));
  const error = mode === 'api' && (homesQuery.isError || (!!home && energyQuery.isError));
  const bills = sortBills(data?.bills ?? []);
  const selected = bills.find(bill => bill.id === periodId) ?? bills.at(-1);
  const isDemo = mode === 'demo' || data?.dashboard.data_status.is_demo || bills.some(bill => bill.source === 'seed');

  function resetSelection() { setHomeId(''); setPeriodId(''); }
  return <section className={styles.dashboard} aria-labelledby={`${id}-title`} aria-busy={loading}>
    <header><p className={styles.eyebrow}>ENERGY RD · DASHBOARD ENERGÉTICO</p><h1 id={`${id}-title`}>Tu energía, mes a mes</h1><p>Consumo facturado, comparación y orientación para tu vivienda.</p></header>
    <div className={styles.filters}>
      <label htmlFor={`${id}-mode`}>Origen de datos<select id={`${id}-mode`} value={mode} disabled={!allowModeSwitch} onChange={event => { setMode(event.target.value as 'api' | 'demo'); resetSelection(); }}><option value="api">API real</option><option value="demo">DEMO · fixtures ficticios</option></select></label>
      <label htmlFor={`${id}-home`}>Vivienda<select id={`${id}-home`} value={home?.id ?? ''} disabled={!homes.length} onChange={event => { setHomeId(event.target.value); setPeriodId(''); if (mode === 'api') onHomeChange?.(event.target.value); }}>{!homes.length && <option value="">Sin viviendas disponibles</option>}{homes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label htmlFor={`${id}-period`}>Período de factura<select id={`${id}-period`} value={selected?.id ?? ''} disabled={loading || error || !bills.length} onChange={event => setPeriodId(event.target.value)}>{!bills.length && <option value="">Sin períodos disponibles</option>}{bills.map(bill => <option key={bill.id} value={bill.id}>{period(bill)}</option>)}</select></label>
    </div>
    {isDemo && <p className={styles.notice} role="status"><strong>DEMO</strong> · Datos ficticios. Las etiquetas describen su procedencia dentro del ejemplo.</p>}
    {loading ? <p className={styles.notice} role="status">Cargando dashboard energético…</p>
      : error ? <div className={styles.notice} role="alert"><p>No pudimos cargar el dashboard. Revisa la conexión con el API.</p><button type="button" onClick={() => { if (homesQuery.isError) void homesQuery.refetch(); else void energyQuery.refetch(); }}>Reintentar</button></div>
      : !home ? <p className={styles.notice} role="status">No hay viviendas registradas. Registra una vivienda para consultar su consumo.</p>
      : !selected || !data ? <p className={styles.notice} role="status">No hay facturas para esta vivienda. Registra una factura mensual para comenzar.</p>
      : <EnergyDetails data={data} selected={selected} id={id} />}
    <p className={styles.footnote}>REAL: dato de factura · ESTIMATED: estimación · PROJECTED: proyección futura · INFERRED: inferencia de modelo.</p>
    <p className={styles.footnote}>Las facturas no miden consumo horario ni telemetría en tiempo real. Los valores derivados no son mediciones directas.</p>
  </section>;
}

function EnergyDetails({ data, selected, id }: { data: EnergyData; selected: EnergyBill; id: string }) {
  const comparison = compareBill(selected, data.bills);
  const bills = sortBills(data.bills);
  const maximum = Math.max(1, ...bills.map(bill => bill.kwh));
  const dashboard = data.dashboard;
  return <>
    <div className={styles.cards}>
      <article className={styles.card}><h2>Consumo del período seleccionado</h2><p>{period(selected)}</p><strong className={styles.value}>{number.format(selected.kwh)} kWh</strong><p><span className={styles.badge}>REAL</span> · Factura {selected.source === 'seed' ? 'demo' : 'manual'}</p><p>Importe facturado: RD$ {number.format(selected.amount_dop)} · REAL</p></article>
      <article className={styles.card}><h2>Comparación mensual</h2>{comparison ? <><strong className={styles.value}>{comparison.delta > 0 ? '+' : ''}{number.format(comparison.delta)} kWh</strong><p>{comparison.percent === null ? 'Porcentaje no disponible: base de 0 kWh.' : `${number.format(comparison.percent)} %`}</p><p>Frente a {period(comparison.previous)} · REAL / REAL</p><p>Los períodos pueden tener distinta duración; se comparan totales facturados.</p></> : <p>No hay una factura única del mes calendario anterior para comparar.</p>}</article>
    </div>
    <section className={styles.card} aria-labelledby={`${id}-chart`}><h2 id={`${id}-chart`}>Historial mensual por período facturado</h2><p>Sin interpolación de meses ausentes ni reparto artificial por día u hora.</p>
      <div className={styles.chart} role="img" aria-labelledby={`${id}-chart`} aria-describedby={`${id}-chart-description`}>
        {bills.map(bill => <div key={bill.id} className={styles.column}><span>{number.format(bill.kwh)} kWh</span><div className={styles.track}><div className={styles.bar} style={{ height: `${bill.kwh / maximum * 100}%` }} /></div><span>{bill.period_end}</span><span className={styles.badge}>REAL</span></div>)}
      </div><p id={`${id}-chart-description`}>Cada barra representa el total de una factura. La tabla siguiente contiene los mismos valores y sus períodos exactos.</p>
      <div className={styles.tableWrap}><table><caption>Consumo facturado y procedencia</caption><thead><tr><th scope="col">Período</th><th scope="col">kWh</th><th scope="col">Tipo</th><th scope="col">Fuente</th></tr></thead><tbody>{bills.map(bill => <tr key={bill.id}><th scope="row">{period(bill)}</th><td>{number.format(bill.kwh)}</td><td>REAL</td><td>{bill.source === 'seed' ? 'Factura demo' : 'Factura manual'}</td></tr>)}</tbody></table></div>
    </section>
    <section aria-labelledby={`${id}-insights`}><h2 id={`${id}-insights`}>Orientación de la vivienda</h2><p>Basada en las últimas facturas disponibles del API; no cambia al seleccionar un período histórico.</p><div className={styles.cards}>
      <article className={styles.card}><h3>Próxima factura</h3>{dashboard.projection ? <><strong className={styles.value}>{number.format(dashboard.projection.kwh.value)} {dashboard.projection.kwh.unit}</strong><p><span className={styles.badge}>{dashboard.projection.kwh.quality}</span></p><p>{number.format(dashboard.projection.amount_dop.value)} {dashboard.projection.amount_dop.unit} · {dashboard.projection.amount_dop.quality}</p><p>{dashboard.projection.note}</p><p>{dashboard.projection.bills_used} facturas · método: {dashboard.projection.method}</p></> : <p>No hay datos suficientes para proyectar.</p>}</article>
      <article className={styles.card}><h3>Alerta</h3>{dashboard.alert ? <><p>{dashboard.alert.severity === 'critical' ? 'Crítica' : 'Advertencia'} · <span className={styles.badge}>INFERRED</span></p><p>{dashboard.alert.message}</p><p>Base de comparación: {dashboard.alert.basis_period_start} → {dashboard.alert.basis_period_end}</p></> : <p>No hay alertas disponibles.</p>}</article>
      <article className={styles.card}><h3>Recomendación</h3>{dashboard.recommendation ? <><span className={styles.badge}>INFERRED</span><p>{dashboard.recommendation}</p></> : <p>No hay recomendaciones disponibles.</p>}</article>
    </div><p className={styles.footnote}>INFERRED identifica aquí orientación derivada por reglas del API, no una medición de equipos.</p>
      {dashboard.data_status.insufficient_reasons.length > 0 && <ul>{dashboard.data_status.insufficient_reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
    </section>
    <p className={styles.footnote}>Etiquetas disponibles: {DATA_STATUSES.join(' / ')}.</p>
  </>;
}
