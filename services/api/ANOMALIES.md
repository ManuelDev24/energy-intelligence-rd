# Anomalías de consumo (ERD-ANOM-01-COMPLETE)

Hallazgos **persistidos**, explicables y con confianza, calculados con lecturas del medidor y con facturas. No atribuyen
nada a un equipo ni afirman una causa: describen una desviación y qué la respalda. Migración `0019`, tabla `anomalies`.

## Qué detecta
| Tipo | Fuente / escala | Regla (umbrales por defecto, sin calibrar con datos reales) |
|---|---|---|
| `peak` pico | lecturas, por **día** | el día supera ≥ +100 % la mediana de los hasta 6 días previos con lecturas **y** ≥ 3 kWh de más; ≥ +200 % es crítico |
| `increase` aumento | lecturas por **mes**; facturas (`billing`) | ritmo kWh/día ≥ +50 % sobre la mediana de hasta 6 períodos previos; ≥ +100 % es crítico |
| `drop` caída | igual que `increase`, hacia abajo | ≤ −40 % informativa, ≤ −70 % advertencia; **nunca crítica** (es ambigua: menos ocupación, lectura estimada…) |
| `night` consumo nocturno | lecturas **dentro** de 23:00–05:00 (hora de RD) | la noche avanzó ≥ 60 % del ritmo horario promedio de los últimos 30 días y ≥ 0,15 kWh/h; ≥ 100 % es advertencia |

Reglas de honestidad (probadas en `tests/test_anomaly_engine.py`):
- Se compara por **ritmo** (kWh por día *cubierto*), nunca por total: un período parcial no parece una caída.
- Un hueco no es cero: los días sin lecturas simplemente no existen en la historia.
- Mínimo 3 períodos previos; línea base < 0,5 kWh/día no se compara; períodos con cobertura < 50 % se ignoran.
- La noche exige **lecturas dentro de la ventana nocturna** (no se interpola) y ≥ 3 días de referencia.
- Si lecturas y facturas señalan lo mismo (mismo tipo, períodos solapados) se conserva una: la de mayor confianza; en empate, la factura.
- `baseline_kwh` se expresa sobre los **mismos días** que `observed_kwh` (línea base × días cubiertos), así `delta_pct` se lee directo.

## Confianza (`low` / `medium` / `high`)
Puntos visibles (`confidence_for`): historial ≥ 6 períodos → 2, ≥ 4 → 1; cobertura ≥ 90 % → 1; dato medido (no repartido entre
bordes) → 1; línea base estable (MAD/mediana ≤ 25 %) → 1; magnitud ≥ 1,5× el umbral → 1. **≥ 5 alta, ≥ 3 media, si no baja.**
La confianza dice cuánto respaldan los datos el hallazgo, **no** cuánto dinero implica ni si el aparato está fallando. Para la
noche: alta con ≥ 4 h y ≥ 3 noches parecidas en 3 días; media con ≥ 4 h o ≥ 2 noches; si no, baja.

## Ciclo de vida
`open` → `acknowledged` → `dismissed` (la persona; reversible) · `resolved` (lo pone el escaneo cuando ya no se detecta).
- Clave de deduplicación `(vivienda, tipo, fuente, escala, inicio, fin)`: volver a escanear **actualiza**, no duplica.
- Lo descartado no reaparece ni se modifica. Una resuelta que vuelve a detectarse se **reabre** (mismo id).
- Una resuelta no se puede cambiar a mano (409).
- Se borran en cascada con la vivienda y con la factura que las originó.

## Cuándo se escanea
1. **En línea**, dentro de la misma transacción, tras crear/editar/borrar facturas y crear/borrar lecturas (con un `SAVEPOINT`:
   si el motor falla, la escritura del usuario no se pierde; el escaneo diario lo reintenta). No requiere worker.
2. Trabajo `anomalies.scan_home` (`POST /homes/{id}/anomalies/scan`, 202; una solicitud por minuto y vivienda).
3. Programador diario `anomalies.scan_all`: encola un `scan_home` por vivienda con datos recientes (clave por día; ver `docs/ops/JOBS.md`).
El horizonte es móvil: días de los últimos 60, meses de los últimos 12, facturas de los últimos 24 meses (`ANOMALY_*` en la configuración).

## API (`/api/v1/homes/{id}/anomalies`)
`GET` (filtros `status` = `active`\|`open`\|`acknowledged`\|`dismissed`\|`resolved`\|`all`, `granularity`, `kind`, `limit` ≤ 100; por defecto las vigentes) ·
`PATCH /{anomaly_id}` `{status: open|acknowledged|dismissed}` · `POST /scan`. Los parámetros `warning_delta_pct`/`critical_delta_pct` de la versión
anterior (lectura en vivo, un solo hallazgo) **ya no existen**: los umbrales son configuración del servidor.
`delta_pct` es `null` en la noche. Web (BFF con lista cerrada de filtros) y móvil muestran título por tipo, confianza, «Investigar en Consumo»
(solo lecturas), «Ver factura» (solo facturas) y «Descartar».

## Verificado y no verificado
- Verificado: 29 pruebas del motor puro, 21 de persistencia/API/trabajos (todas con fechas relativas a hoy), BFF (10), cliente (5), web (8 de la
  sección), móvil (lógica y estructura) y una corrida en navegador real (`docs/qa/evidence/anom-complete-2026-10-10/`, 12/12) con datos **sintéticos**.
- **No verificado**: la **calibración** de umbrales con consumos reales de viviendas dominicanas (los valores son puntos de partida
  razonables, no medidos; revisar tras ERD-OCR-REAL-QA y el piloto), falsos positivos/negativos reales, la pantalla móvil en dispositivo,
  y el rendimiento del escaneo en línea con historiales de años (limitado por el horizonte y 800 días de lecturas; sin medir).
- **No implementado a propósito**: «patrones nuevos» (cambios de nivel sostenidos) y comparación por día de la semana; requieren historial real para no inventar reglas.
