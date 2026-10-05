# Energy RD API (FastAPI + PostgreSQL)

Autenticación y límites persistentes: `AUTH_IMPLEMENTATION.md` y
`AUTH_ABUSE_PROTECTION.md`.

## Levantar todo con Docker (PostgreSQL + API)

```bash
cp .env.example .env            # opcional: los defaults de compose ya funcionan
SEED_PILOT=true docker compose up -d --build postgres api
curl localhost:8000/health      # {"status":"healthy","database":"ok"}
open http://localhost:8000/docs # OpenAPI
```

El contenedor `api` valida la configuración y arranca uvicorn. Solo ejecuta migraciones
cuando `MIGRATE_ON_START=true` (Compose lo activa para desarrollo local).
El seed idempotente es opt-in (`SEED_PILOT=true`); sin esa opción no crea datos demo.
PostgreSQL se publica en el puerto **5433** del host (evita choques con un Postgres local en 5432).

## Desarrollo local

```bash
cd services/api
uv sync                              # instala desde uv.lock (Python 3.12)
docker compose up -d postgres        # desde la raíz
uv run alembic upgrade head
uv run python -m app.seed            # 5 viviendas piloto; repetirlo no duplica
uv run uvicorn app.main:app --reload --no-proxy-headers
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

## Estabilización del piloto

El piloto sigue sin autenticación: mantener API y datos en un entorno privado. CORS no controla
el acceso de clientes externos. La selección de vivienda no es una credencial.

`ENVIRONMENT=production` o `staging` exige credenciales de DB no locales, orígenes CORS HTTPS
explícitos y `SEED_PILOT=false`. Estas validaciones no sustituyen autenticación ni autorización.
Fuera de `development` también exige `EMAIL_BACKEND=resend`, `RESEND_API_KEY`, `EMAIL_FROM` y
`PASSWORD_RESET_URL` HTTPS (recuperación de contraseña, ver `PASSWORD_RECOVERY.md`).

Las pruebas recrean el schema de una base desechable. `TEST_DATABASE_URL` debe usar PostgreSQL,
un nombre con letras/dígitos/guiones bajos terminado en `_test`, y distinto de la base de aplicación.
La URL se valida antes de conectar o crear la base. En CI una conexión fallida provoca fallo,
no una suite verde con pruebas omitidas.

La migración `0004` amplía `alerts.kwh_pct` a `Numeric(18,2)` sin cambiar el formato JSON.
El downgrade a `0003` falla si hay porcentajes que no caben en `Numeric(8,2)`; no redondea ni borra datos.


## Consistencia y contratos

La migración `0005` aplica exclusión GiST por vivienda/período, timestamps de edición y
`audit_events`. Los servicios bloquean la vivienda antes de escribir; facturas, alertas y auditoría
se confirman juntos. Una migración con períodos ya solapados falla sin borrar registros.
El proveedor DB debe admitir `btree_gist`. El downgrade de `0005` elimina el historial de auditoría;
para recuperar datos usar backup probado, no un downgrade como sustituto de restauración.

Listas: `limit` entre 1 y 500 (default 100), `offset` >= 0; se mantiene el formato array.
Los clientes compartidos recorren las páginas. `/health/live` verifica el proceso; `/health` verifica DB.
El pool se controla con `DB_POOL_SIZE`, `DB_MAX_OVERFLOW` y `DB_POOL_TIMEOUT`.

Desde la raíz: `npm run contracts:generate` y `npm run contracts:check`.
Pydantic es la fuente de los tipos/parsers TS y OpenAPI. Ver `docs/architecture/CURRENT_ARCHITECTURE.md`.
