# Interrupciones del servicio eléctrico (ERD-INT-01)

Registro **manual** de apagones por vivienda, con historial y resumen mensual. Módulos: `app/models/outage.py`,
`app/schemas/outage.py`, `app/services/outages.py` (sin FastAPI), `app/api/v1/outages.py`, tabla `power_outages`
(migración `0023`).

## Datos
| Campo | Regla |
|---|---|
| `started_at` | obligatorio, con zona horaria, no puede estar en el futuro (±5 min de reloj desfasado) |
| `ended_at` | nulo = **todavía sin luz**; si existe, debe ser posterior al inicio, no futuro y a ≤ 30 días del inicio |
| `cause` | `unknown` · `utility_fault` · `scheduled` · `weather` · `home_fault` (catálogo cerrado) |
| `note` | opcional, ≤ 255; en blanco = `null` |
| `ongoing`, `duration_minutes` | calculados por el servidor; la duración es `null` mientras el apagón siga abierto |

**Sin solapes**: una vivienda no puede tener dos apagones que se solapen, ni dos abiertos. Lo garantiza la base con
`EXCLUDE USING gist (home_id WITH =, tstzrange(started_at, coalesce(ended_at,'infinity'), '[)') WITH &&)` (empezar justo
cuando termina otro está permitido) y el servicio responde antes con un mensaje claro (409). Las escrituras bloquean la
vivienda, así que dos solicitudes simultáneas tampoco pueden crear un solape. Cada alta, edición y baja queda en la auditoría.

## API (bajo `authorize_home`: ajeno → 404, sin token → 401)
| Método y ruta | Qué hace |
|---|---|
| `GET /homes/{h}/outages?limit&offset` | historial, del más reciente al más antiguo |
| `GET /homes/{h}/outages/summary?months=12` | totales por mes calendario (1–24 meses, incluidos los vacíos) |
| `POST /homes/{h}/outages` | registrar |
| `GET/PUT/DELETE /homes/{h}/outages/{id}` | ver, reemplazar (también sirve para cerrar uno abierto) o eliminar |

## Resumen mensual
Meses del calendario de `America/Santo_Domingo`. **Cada apagón se cuenta entero en el mes en que empezó** (conteo, tiempo,
más largo y promedio), aunque termine en el mes siguiente; uno abierto suma su duración hasta ahora y se marca `ongoing`.
Es una convención explícita y visible en la respuesta (`note`), no una verificación con la distribuidora.

## Privacidad y derechos
Los apagones forman parte de **la exportación de datos de la cuenta** (`/auth/me/export`, junto con las recomendaciones) y
se borran en cascada con la vivienda o la cuenta. No incluyen datos de terceros.
