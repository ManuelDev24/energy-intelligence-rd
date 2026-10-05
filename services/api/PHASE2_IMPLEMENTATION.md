# Fase 2 — Lecturas, consumo, metas y tarifas (backend)

Tareas: ERD-DB-02 (parcial: lecturas), ERD-CONS-01, ERD-GOAL-01, ERD-TARIFF-01 (esquema + motor + BTS-1 oct–dic 2026).

## Migraciones
| Rev. | Tipo | Contenido | Downgrade |
|---|---|---|---|
| `0007` | esquema | `meter_readings`, `home_goals`, `tariffs`, `tariff_fixed_charges`, `tariff_blocks` | borra las 5 tablas (conserva `btree_gist`, usado por facturas) |
| `0008` | datos | 3 tarifas BTS-1 oficiales (EDESUR/EDENORTE/EDEESTE) | borra **solo** esas 3 filas (UUID fijos, uuid5); bloques y cargos caen en cascada |

Restricciones relevantes:
- `meter_readings`: `reading_kwh >= 0`, `source IN ('manual')`, único `(home_id, read_at)`, FK `ON DELETE CASCADE`.
- `home_goals`: PK = `home_id`; al menos una meta (`monthly_amount_rd` o `monthly_kwh`), ambas `> 0`.
- `tariffs`: distribuidora ∈ {EDESUR, EDENORTE, EDEESTE} (no `Otra`), `effective_to >= effective_from`, `flat_all_units_from_kwh > 0`,
  y **EXCLUDE** que impide versiones solapadas del mismo `(distributor, tariff_code)`.
- `tariff_fixed_charges` / `tariff_blocks`: rangos `(from_kwh, to_kwh]`, `to_kwh NULL` = sin tope, valores `>= 0`.

## Endpoints
Todos los de `/api/v1/homes/{home_id}/...` dependen de `authorize_home` (401 sin token, 404 a no miembros) y están en
`tests/test_authorization.py::cases()`.

| Método | Ruta | Notas |
|---|---|---|
| GET | `/homes/{id}/readings?limit&offset` | más reciente primero; `limit` 1–500 |
| POST | `/homes/{id}/readings` | `{read_at (con zona), reading_kwh, note?}`; 201; auditado |
| DELETE | `/homes/{id}/readings/{reading_id}` | 204; auditado; 404 si la lectura es de otra vivienda |
| GET | `/homes/{id}/consumption?granularity=day\|week\|month&from=YYYY-MM-DD&to=YYYY-MM-DD` | rango inclusive, máx. 366 días |
| GET | `/homes/{id}/goal` | `null` si no hay meta |
| PUT | `/homes/{id}/goal` | reemplazo completo `{monthly_amount_rd?, monthly_kwh?}`; auditado (`create`/`update`) |
| GET | `/homes/{id}/goal/progress?on=YYYY-MM-DD` | mes calendario que contiene `on` (por defecto hoy en RD) |
| GET | `/tariffs?distributor&on&limit&offset` | **público**; `[]` si no hay datos |

### ¿Por qué `/tariffs` es público?
Expone únicamente pliegos tarifarios publicados por la SIE (dato regulatorio público), sin información de usuarios,
viviendas ni consumo. Exigir sesión no protege nada y obligaría a la app a autenticarse para mostrar precios oficiales.
Pendiente común a toda la API: rate limiting.

## Lecturas (reglas)
- `read_at` debe traer zona horaria; se guarda `timestamptz` y se devuelve en UTC. Lecturas futuras (> ahora + 5 min) → 422.
- Monotonía no decreciente por vivienda: la nueva lectura debe ser `>=` la anterior y `<=` la siguiente en el tiempo
  (validado en servicio, con la fila de la vivienda bloqueada) → `422 invalid_input`. Mismo instante → `409`.
- **Reemplazo de medidor NO soportado**: una lectura menor que la anterior siempre se rechaza. Borrar una lectura mantiene la serie monótona.

## Consumo y semántica de calidad
Matemática pura en `app/services/consumption_calc.py` (sin `app.`/SQLAlchemy/FastAPI; vigilado por `scripts/check_architecture.py`).
- Intervalo = delta entre dos lecturas consecutivas → energía **REAL** de ese intervalo.
- Buckets de calendario en `America/Santo_Domingo` (UTC−4 fijo; respaldo de zona fija si la imagen no trae tzdata); semanas ISO lunes–domingo;
  el primer/último bucket se recorta al rango pedido. `start`/`end` son días locales inclusivos.
- Bucket `REAL` si ningún intervalo que lo toca cruza sus bordes; `ESTIMATED` si se repartió energía proporcional al tiempo.
- `coverage_ratio` (0–1) = fracción del bucket cubierta por intervalos. Cubierto parcialmente → `reason_code=partial_coverage`;
  **el valor no se extrapola**.
- Sin intervalo que lo cubra → `kwh=null`, `quality=null`, `reason_code=no_coverage`: **nunca 0**. Un 0 solo aparece si el medidor no avanzó (dato REAL).
- Se usan la lectura anterior y la posterior al rango para cubrir los bordes. El reparto es telescópico: la suma de partes = delta exacto.
- Totales: `REAL` si todos los buckets con valor son REAL, si no `ESTIMATED`. `average_daily_kwh` = total / días cubiertos, siempre `ESTIMATED`.
- `peak_bucket` = mayor kWh entre buckets con valor (empate: el más antiguo). Un bucket parcial puede estar subestimado.

## Metas y progreso
Pura en `calculations.py`: `goal_status`, `goal_percent`, `run_rate`, `worst_goal_status`.
- kWh del mes hasta `as_of`: lecturas (REAL/ESTIMATED) → si no hay, facturas que solapan el mes prorrateadas por días (ESTIMATED).
- Proyección (`PROJECTED`): ritmo diario de lecturas × días del mes (`run_rate_readings`, requiere ≥ 1 día cubierto); si no,
  la proyección lineal existente de facturas (`project_next`, ≥ 2 facturas, `linear_least_squares` = próxima factura mensual).
- RD$: prorrateo de facturas (`bills_prorated`); o desde kWh con la **tarifa vigente** (`basis=tariff`, `ESTIMATED`, incluye `tariff.source_resolution`/`source_url`);
  o con el precio medio de la última factura (`bill_average_price`, ESTIMATED). Sin tarifa ni montos de factura → `insufficient_data` con motivo; **no se inventa RD$**.
  La proyección de RD$ con tarifa se etiqueta `PROJECTED` y también lleva `tariff`.
- Estado por meta: `exceeded` (observado > meta) > `at_risk` (proyección > meta) > `on_track`; sin proyección → `insufficient_data`.
  Estado global = el peor según `exceeded > at_risk > insufficient_data > on_track`. Sin meta → `insufficient_data`.
- El costo con tarifa del mes en curso incluye el cargo fijo completo del mes (es “lo que costaría si el mes cerrara hoy”).

## Tarifas
Motor puro `app/services/tariff_calc.py` (Decimal, `ROUND_HALF_UP` a 2 decimales por línea):
- Cargo fijo por **rango de consumo mensual** (`tariff_fixed_charges`): se cobra uno, el del rango que contiene el consumo (0 kWh → primer rango).
- Energía escalonada por bloques `(from, to]`.
- `flat_all_units_from_kwh`: si consumo ≥ umbral, **todos** los kWh al precio del bloque que contiene el umbral (BTS-1: ≥ 701 kWh → 4º rango, sin escalonado).
  Nota: 700 → RD$ 7,353.59 y 701 → RD$ 9,304.68 en EDESUR; el salto es la regla oficial.
- Rangos/bloques validados: empiezan en 0, contiguos, último abierto, valores ≥ 0.
- Resolución (`services/tariffs.resolve_tariff`): versión de `BTS-1` vigente en la fecha; sin versión → `tariff_unavailable` con motivo.
  **Nunca** reutiliza una versión vencida. Las viviendas no guardan aún su código tarifario: se asume `BTS-1` residencial.

Datos cargados (0008), columna **“Tarifas de Transición”**, `SIE-121-2026-TF`, https://sie.gob.do/document/sie-121-2026-tf/,
vigencia 2026-10-01..2026-12-31 (facturas emitidas en el trimestre; el sistema usa la fecha `on` como aproximación), solo circuitos SENI.
Detalle y verificación: `docs/architecture/TARIFF_BTS1_2026Q4.md`. Golden tests EDESUR: 80→526.10, 250→1,768.09, 500→4,775.59, 750→9,946.09.

## Límites conocidos
- Sin reemplazo/reinicio de medidor; sin datos horarios (`hourly_data_available=false`), resolución mínima = intervalo entre lecturas.
- Tarifas: solo BTS-1 oct–dic 2026. Desde 2027-01-01 → `tariff_unavailable` hasta cargar la siguiente resolución.
  No cargados: columna de referencia (no facturable), Pedernales (Art. 3), BTS-2/BTD/BTH/MT, Bono Luz. Costos sin impuestos/alumbrado/otros cargos → `ESTIMATED`.
- `GET /tariffs` filtra por distribuidora/fecha; sin `tariff_code` por vivienda.
- No hay `DELETE /goal` (PUT exige al menos una meta).
- Contratos Zod: los límites numéricos de entradas Decimal (≥ 0, formato) no se traducen de forma estricta (limitación previa del
  generador, también en `BillCreate`); la API los valida con 422.

## Verificación
```
cd services/api && env -u PYTHONPATH uv run python tests/run_isolated.py -q
env -u PYTHONPATH uv run python -m scripts.generate_contracts --check
python3 scripts/check_architecture.py                      # desde la raíz
fnm exec --using=24 npm test --workspace packages/api-contracts && fnm exec --using=24 npm run typecheck
```
