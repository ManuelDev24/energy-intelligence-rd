# ERD-ADM-SYSTEM-WEB — configuración y salud del sistema (solo lectura)

Estado: **implementado y verificado** con pruebas de API (también como `erd_app`), unitarias de la consola y Playwright contra PostgreSQL + API + consola reales (26/26 en `apps/admin`, axe sin violaciones a 360/768/1280 px).

## Qué hay
- **`GET /api/v1/admin/system`** (scope existente `admin.system.read`): entorno, versión de la API, commit desplegado (si la plataforma lo informa), arranque y tiempo en marcha, estado de las **migraciones** (revisión aplicada vs la más reciente del código), ~17 **comprobaciones de configuración**, **fechas declaradas** de respaldo y simulacro, y guías operativas.
- **Consola** `/sistema`: aviso general (en orden / revisar / crítico), tablas con texto de estado (no solo color) y recuento por estado.
- Migración **0041**: `GRANT SELECT ON alembic_version` a `erd_app`/`erd_worker`. Hallazgo de esta tarea: sin él, en producción (API como `erd_app`) el estado de migraciones sería siempre «no verificable». La tabla solo guarda el identificador de la revisión.

## Regla de oro: nada de valores
Cada comprobación dice **si** el ajuste cumple lo que la aplicación exige y con **qué nombre** de variable; nunca su valor, clave, URL ni correo. La prueba `test_no_check_ever_contains_a_secret_or_a_url` siembra secretos y URLs reales en una configuración simulada y verifica que ninguno aparece; Playwright verifica lo mismo en la página.

## Qué es medido y qué es declarado
| Dato | Fuente |
|---|---|
| Versión, tiempo en marcha, migraciones, comprobaciones de configuración | **Medido** en el proceso de la API |
| Commit desplegado | `RENDER_GIT_COMMIT` o `GIT_SHA` si la plataforma lo da; si no, «No informada» |
| Último respaldo verificado / último simulacro de restauración | **Declarado por operaciones** (`OPS_LAST_BACKUP_VERIFIED_AT`, `OPS_LAST_RESTORE_DRILL_AT`); no se mide. Máximos: 35 y 180 días; pasado el máximo se marca «Vencido» y sin fecha «Sin dato» |

No hay verificación automática de respaldos: mostrar «OK» sin medirlo sería mentir. El aviso general no llega a «todo en orden» mientras haya fechas sin declarar o vencidas.

## Qué NO hay (y por qué)
- **Estado en vivo del worker, la cola y el dead-letter**: ya están en `/operaciones` (con su propia regla de «posiblemente detenido»).
- **Sonda activa de almacenamiento o de Sentry**: solo se comprueba que estén configurados; no se hace una llamada de prueba a terceros desde la consola.
- **Alertas operativas hacia fuera** (correo/chat) y **editar configuración desde la consola**: requieren decisiones de monitoreo y de seguridad.

## Evidencia
| Criterio | Prueba |
|---|---|
| Configuración sana de producción: sin faltantes ni avisos | `test_a_healthy_production_config_has_no_missing_or_warning_checks` |
| Faltantes y avisos reportados por nombre | `test_missing_pieces_are_reported_by_name_without_values` |
| Desarrollo: lo exclusivo de producción es «No aplica» | `test_development_marks_production_only_settings_as_not_applicable` |
| Ningún secreto, URL, correo ni bucket en la respuesta | `test_no_check_ever_contains_a_secret_or_a_url`, Playwright |
| Fechas declaradas: sin dato, al día, vencidas, sin zona horaria | `test_attestations_are_declared_not_measured_and_go_stale` |
| 401/403 (persona normal, soporte), `no-store`, migraciones al día **como `erd_app`**, solo lectura | `test_system_route_scope_migrations_and_no_secret_values` |
| Reglas de la consola (peor estado, textos, formato) | `system.test.ts` |
| El BFF solo deja pasar `GET /system` sin parámetros | `bff.test.ts` |
| Accesibilidad | `a11y.spec.ts` incluye `/sistema` a 360/768/1280 px |

## Pendiente (acción humana)
- Declarar `OPS_LAST_BACKUP_VERIFIED_AT` y `OPS_LAST_RESTORE_DRILL_AT` en staging/producción tras el primer respaldo verificado y el primer ensayo de restauración reales (`docs/ops/DISASTER_RECOVERY.md`).
