'use client';

import { useId, useState } from 'react';
import { compareMonth, filterConsumption } from './model';
import { DATA_STATUSES, type ConsumptionFilters, type DashboardState, type Home } from './types';
import styles from './consumption.module.css';

const number = new Intl.NumberFormat('es-DO', { maximumFractionDigits: 1 });
function monthLabel(month: string) {
  return new Intl.DateTimeFormat('es-DO', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${month}-01T00:00:00Z`));
}

export interface ConsumptionDashboardProps {
  state: DashboardState;
  homes: readonly Home[];
  initialFilters: ConsumptionFilters;
  onRetry?: () => void;
}

export function ConsumptionDashboard({ state, homes, initialFilters, onRetry }: ConsumptionDashboardProps) {
  const id = useId();
  const [filters, setFilters] = useState(initialFilters);
  const records = state.kind === 'ready' || state.kind === 'demo' ? state.records : [];
  const years = Array.from(new Set([filters.year, ...records.map(record => record.month.slice(0, 4))])).sort();
  const visible = filterConsumption(records, filters);
  const latest = visible.at(-1);
  // Comparison respects all active filters and never skips a missing calendar month.
  const comparison = latest ? compareMonth(latest, visible) : null;
  const maximum = Math.max(1, ...visible.map(record => record.kWh));

  return <section className={styles.dashboard} aria-labelledby={`${id}-title`} aria-busy={state.kind === 'loading'}>
    <header><p className={styles.eyebrow}>ENERGY RD · CONSUMO</p><h1 id={`${id}-title`}>Tu energía, mes a mes</h1>
      <p>Consulta los totales mensuales y la procedencia de cada dato.</p></header>
    {state.kind === 'demo' && <p className={styles.notice} role="status"><strong>DEMO</strong> · Datos ficticios para explorar el dashboard.</p>}
    <div className={styles.filters}>
      <label htmlFor={`${id}-home`}>Propiedad<select id={`${id}-home`} value={filters.homeId} onChange={event => setFilters({ ...filters, homeId: event.target.value })}>
        {homes.map(home => <option key={home.id} value={home.id}>{home.name}</option>)}</select></label>
      <label htmlFor={`${id}-year`}>Año<select id={`${id}-year`} value={filters.year} onChange={event => setFilters({ ...filters, year: event.target.value })}>
        {years.map(year => <option key={year}>{year}</option>)}</select></label>
      <label htmlFor={`${id}-status`}>Tipo de dato<select id={`${id}-status`} value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value as ConsumptionFilters['status'] })}>
        <option value="ALL">Todos</option>{DATA_STATUSES.map(status => <option key={status}>{status}</option>)}</select></label>
    </div>
    {state.kind === 'loading' ? <p className={styles.notice} role="status">Cargando consumo mensual…</p>
      : state.kind === 'error' ? <div className={styles.notice} role="alert"><p>{state.message}</p>{onRetry && <button type="button" onClick={onRetry}>Reintentar</button>}</div>
      : !latest ? <p className={styles.notice} role="status">No hay consumo mensual para estos filtros.</p>
      : <>
        <div className={styles.cards}>
          <article className={styles.card}><h2>Último mes disponible</h2><p>{monthLabel(latest.month)}</p><strong className={styles.value}>{number.format(latest.kWh)} kWh</strong><p><span className={styles.badge}>{latest.status}</span> · {latest.source}</p></article>
          <article className={styles.card}><h2>Comparación con el mes anterior</h2>{comparison ? <><strong className={styles.value}>{comparison.delta > 0 ? '+' : ''}{number.format(comparison.delta)} kWh</strong><p>{comparison.percent === null ? 'Porcentaje no disponible: el mes anterior tiene 0 kWh.' : `${number.format(comparison.percent)} % frente a ${monthLabel(comparison.previous.month)}`}</p><p>{latest.status} / {comparison.previous.status}</p></> : <p>No hay datos del mes anterior para estos filtros.</p>}</article>
        </div>
        <div className={styles.card}><h2>Consumo mensual (kWh)</h2><p>Los meses sin registros permanecen sin datos. No se interpolan valores.</p>
          <div className={styles.chart} role="img" aria-label="Gráfica de consumo mensual; los valores y su procedencia están en la tabla siguiente.">
            {visible.map(record => <div key={record.id} className={styles.column}><span>{number.format(record.kWh)}</span><div className={styles.track}><div className={styles.bar} style={{ height: `${record.kWh / maximum * 100}%` }} /></div><span>{record.month}</span><span className={styles.badge}>{record.status}</span></div>)}
          </div>
          <div className={styles.tableWrap}><table><caption>Valores mensuales y fuentes</caption><thead><tr><th scope="col">Mes</th><th scope="col">kWh</th><th scope="col">Tipo</th><th scope="col">Fuente</th></tr></thead><tbody>{visible.map(record => <tr key={record.id}><th scope="row">{monthLabel(record.month)}</th><td>{number.format(record.kWh)}</td><td>{record.status}</td><td>{record.source}</td></tr>)}</tbody></table></div>
        </div>
      </>}
    <p className={styles.footnote}>REAL: fuente confiable · ESTIMATED: estimación · PROJECTED: proyección futura · INFERRED: inferencia de modelo.</p>
    <p className={styles.footnote}>Las facturas mensuales no permiten conocer el consumo horario. Esta vista muestra únicamente totales mensuales.</p>
  </section>;
}
