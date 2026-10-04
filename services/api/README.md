# Energy RD API (FastAPI + PostgreSQL)

## Levantar todo con Docker (PostgreSQL + API)

```bash
cp .env.example .env            # opcional: los defaults de compose ya funcionan
docker compose up -d --build postgres api
curl localhost:8000/health      # {"status":"healthy","database":"ok"}
open http://localhost:8000/docs # OpenAPI
```

El contenedor `api` ejecuta `alembic upgrade head`, el seed idempotente (`SEED_PILOT=true`) y uvicorn.
PostgreSQL se publica en el puerto **5433** del host (evita choques con un Postgres local en 5432).

## Desarrollo local

```bash
cd services/api
uv sync                              # instala desde uv.lock (Python 3.12)
docker compose up -d postgres        # desde la raíz
uv run alembic upgrade head
uv run python -m app.seed            # 5 viviendas piloto; repetirlo no duplica
uv run uvicorn app.main:app --reload
uv run pytest                        # usa la base energy_rd_test (la crea sola)
```

## Endpoints (`/api/v1`)

| Método | Ruta | Descripción |
|---|---|---|
| GET/POST | `/homes` | Listar / crear viviendas |
| GET/PATCH/DELETE | `/homes/{home_id}` | Detalle / editar / borrar |
| GET/POST | `/homes/{home_id}/bills` | Listar / crear facturas manuales |
| GET/PUT/DELETE | `/homes/{home_id}/bills/{bill_id}` | Detalle / reemplazar / borrar |
| GET | `/homes/{home_id}/dashboard` | Consumo, variación, proyección y alerta |
| GET/POST | `/homes/{home_id}/equipment` | Listar / declarar equipos (nombre, habitación, W, horas/día) |
| GET | `/homes/{home_id}/equipment/estimate` | Consumo estimado por equipo y total (`ESTIMATED`) |
| GET/PUT/DELETE | `/homes/{home_id}/equipment/{equipment_id}` | Detalle / reemplazar / borrar equipo |
| GET | `/homes/{home_id}/alerts` | Alertas de variación (`?status=unread\|read\|dismissed`, `?include_dismissed=true`) |
| PATCH | `/homes/{home_id}/alerts/{alert_id}` | Cambiar estado: `unread`, `read`, `dismissed` |
| GET/PUT | `/homes/{home_id}/alert-settings` | Umbrales de la vivienda (`warning_pct`, `critical_pct`) |

Datos inválidos → 422 (validación), vivienda/factura inexistente → 404, período solapado o código duplicado → 409.

## Reglas de datos del dashboard

- `REAL`: valores tomados de una factura. `ESTIMATED`: promedios derivados de totales mensuales
  (kWh/día, RD$/kWh). `PROJECTED`: proyección lineal (mínimos cuadrados, últimas ≤6 facturas).
- Con menos de 2 facturas no hay comparación ni proyección; el motivo va en `data_status.insufficient_reasons`.
- Si el período base tiene 0 kWh no se calcula porcentaje. No hay métricas horarias (`hourly_data_available=false`).
- Alerta por reglas sobre variación de kWh: ≥20 % `warning`, ≥40 % `critical` (umbrales configurables por vivienda).
- Las facturas del seed llevan `source="seed"` y el dashboard marca `is_demo=true`.

## Equipos y alertas (ERD-API-INSIGHTS)

- **Equipos:** consumo = W × horas/día ÷ 1000 (× 30 días al mes). Siempre `ESTIMATED`: no es una medición.
  `bill_coverage_pct` indica qué % de la última factura (normalizada a 30 días) explican los equipos declarados.
- **Alertas:** se recalculan en cada alta/edición/baja de factura y al cambiar umbrales. Solo hay alerta si existe
  factura anterior (período base) y se supera el umbral; base de 0 kWh nunca alerta. Recalcular conserva
  `read`/`dismissed`, salvo que cambie el contenido de la alerta (vuelve a `unread`).
- Validación: potencia 0–100 000 W, horas 0–24, umbrales > 0 y `critical_pct ≥ warning_pct` (422 si no).

## CORS

`CORS_ORIGINS` (lista separada por comas) define los orígenes permitidos; por defecto solo localhost de web/Expo.
