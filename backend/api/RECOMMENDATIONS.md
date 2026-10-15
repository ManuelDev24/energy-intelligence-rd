# Recomendaciones de ahorro (ERD-SAVE-01)

Motor explicable, versionado e idempotente. Módulos: `app/services/recommendation_engine.py` (puro: sin HTTP, ORM ni base de
datos), `app/services/recommendations.py` (hechos + conciliación + estados), `app/api/v1/recommendations.py`, tabla
`recommendations` (migración `0022`).

## Reglas (conjunto `RULESET_VERSION = 1`)

| Regla (`rule_id`) | Cuándo aplica | Ahorro estimado / mes | Confianza |
|---|---|---|---|
| `ac-one-hour` | aire acondicionado con ≥ 4 h/día | potencia × 1 h × 30 | media |
| `water-heater-half-hour` | calentador con ≥ 1 h/día | potencia × 0,5 h × 30 | media |
| `pool-pump-six-hours` | bomba de piscina con > 6 h/día | potencia × (horas − 6) × 30 | media |
| `lighting-led` | iluminación con ≥ 5 kWh/mes | 60 % de su consumo | baja |
| `always-on-two-hours` | TV, computador o ventilador con ≥ 12 h/día | potencia × 2 h × 30 | media |
| `fridge-care` | nevera con ≥ 20 % del consumo estimado | 5 % de su consumo | baja |
| `top-consumer` | cualquier equipo ≥ 40 % sin regla específica aplicable | 10 % de su consumo | baja |
| `goal-gap` | la proyección de la próxima factura supera la meta (kWh, o RD$ si no hay meta en kWh) | — (orienta, no promete) | media |
| `anomaly-increase/peak/night` | anomalía **abierta** `warning` o `critical` | — | media |
| `declare-equipment` | hay ≥ 1 factura y ningún equipo | — | alta |

Un equipo recibe **como máximo una** recomendación: así los ahorros por equipo se suman sin contar dos veces lo mismo.
Por debajo de 1 kWh/mes no se muestra nada. Los RD$ salen del precio medio de las últimas 3 facturas (incluye cargos fijos
e impuestos); sin facturas, solo kWh.

## Honestidad
Todo ahorro es `ESTIMATED`, con sus **supuestos escritos** (`assumptions`) y la **evidencia** que lo motivó (`evidence`,
máx. 4 KB). Nunca se presenta como medición ni garantía (`note` de la respuesta). Meta, anomalía y datos no llevan ahorro.

## Versionado e idempotencia
- Cada fila guarda `rule_id`, `rule_version` y `ruleset_version`. Subir la versión de una regla **actualiza en su sitio**
  las recomendaciones vigentes que la usan (misma fila, mismo `id`).
- `UNIQUE (home_id, dedupe_key)` (`<regla>:<id del equipo>`, `anomaly:<id>`, `goal-gap`, `declare-equipment`): recalcular
  con los mismos datos no crea ni modifica nada (`refresh_home` devuelve `created/updated/reopened/resolved = 0`).
- Ciclo de estados: `active` ⇄ `applied` / `dismissed` (decisión de la persona; el motor **no** las toca ni las recalcula)
  y `resolved` (dejó de aplicar; si reaparece, se reabre). Una `resolved` no se puede cambiar a mano (409).

## Cuándo se recalcula
Tras guardar o borrar un equipo, tras guardar la meta, al final de cada escaneo de anomalías (que ya corre tras escribir
facturas/lecturas y a diario) y a pedido con `POST …/recommendations/refresh`. Los recálculos tras escrituras ocurren dentro
de un SAVEPOINT: **un fallo del motor nunca deshace el dato de la persona**.

## API (todas bajo `authorize_home`: ajeno → 404, sin token → 401)
| Método y ruta | Qué hace |
|---|---|
| `GET /api/v1/homes/{home}/recommendations?status=active\|applied\|dismissed\|resolved\|all&limit=` | lista guardada + totales ESTIMATED |
| `POST /api/v1/homes/{home}/recommendations/refresh` | recalcula (idempotente) y devuelve las vigentes |
| `PATCH /api/v1/homes/{home}/recommendations/{id}` `{status: active\|applied\|dismissed}` | decisión de la persona |

## Dificultad, impacto y «Aplicar objetivo» (ERD-SAVE-01-CLOSE)
- Cada recomendación expone `difficulty` (`easy|medium|hard`, tabla fija por `rule_id` en `recommendation_engine.DIFFICULTY`) e `impact`
  (`low|medium|high` según el ahorro estimado: ≥ 10 kWh/mes medio, ≥ 40 alto; `null` si no promete ahorro). Son derivados: no se guardan.
- `GET /recommendations/goal-proposal` (solo lectura): meta propuesta = promedio REAL de kWh de las últimas 3 facturas − suma del ahorro ESTIMADO de las
  recomendaciones de equipos vigentes, redondeada a kWh enteros. Sin facturas, sin recomendaciones de equipos vigentes o con un ahorro mayor que el
  consumo → `proposal: null` y un `reason` en español. Siempre con `assumptions`.
- `POST /recommendations/goal-proposal/apply` (cuerpo vacío): el servidor recalcula la propuesta, guarda la meta en kWh y **conserva** la meta en RD$.
  No acepta cifras del cliente. 409 `no_goal_proposal` si hoy no hay propuesta. Web (tarjeta con confirmación) y móvil (`Alert` nativo) lo usan.
- Los umbrales (10/40 kWh) y la dificultad por regla son criterio de producto aún sin validar con personas usuarias: ajustarlos no requiere migración.

