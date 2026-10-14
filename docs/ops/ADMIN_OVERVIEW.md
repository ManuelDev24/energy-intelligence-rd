# Resumen administrativo (ERD-ADM-DASH-WEB, 2026-10-14)

`apps/admin` → **Resumen** (`/resumen`), scope `admin.system.read` (roles `super_admin` y `operations_admin`). API: `GET /api/v1/admin/overview`
(`Cache-Control: no-store`; cada consulta queda en `admin_audit_events` como cualquier ruta administrativa).

## Qué muestra

| Bloque | Origen | Calidad |
|---|---|---|
| Personas (total, verificadas, nuevas), sesiones activas | `users`, `auth_sessions` | Real |
| Viviendas, facturas (total y recientes), alertas sin leer, apagones recientes | función SQL `admin_overview_counts` (migración 0033) | Real |
| Cola de trabajos: en cola, en curso, dead-letter, OCR pendiente/fallido, espera del más viejo | `jobs` | Real |
| Worker | se **infiere**: hay trabajo vencido esperando ≥ 10 min y nada en curso → «Posiblemente detenido» | Inferido (el worker no reporta su estado) |
| Servicios: base, almacenamiento, correo, seguimiento de errores, Copilot | configuración del proceso de la API | Real, sin valores |
| Copilot hoy y tendencias de 14 días (personas, facturas, preguntas) | `copilot_usage`, `users`, `bills` | Real |

## Privacidad y seguridad

- **Solo agregados.** El API conecta como `erd_app`, sujeto a la RLS por vivienda, y no puede contar los datos de todos los hogares. En vez de
  abrir una política amplia, la función `admin_overview_counts(days)` es `SECURITY DEFINER` (con `search_path` fijo) y devuelve **solo números**:
  nunca filas, identificadores, correos ni texto. Solo `erd_app` y `erd_worker` pueden ejecutarla.
- Las pruebas verifican que no salgan nombres de vivienda, distribuidora ni correos, y que el resultado es correcto con el rol restringido.
- Los gráficos tienen nombre accesible y una tabla alternativa («Ver datos»); el estado no depende solo del color (texto «Bien/Atención/Desactivado»).

## Límites conocidos (no se afirma como hecho)

- No hay latido del worker, tiempos de respuesta de la API ni estado del último backup/restore: eso necesita telemetría propia (ERD-ADM-SYSTEM-WEB).
- «Salud» refleja la configuración y la cola, no sondea servicios externos (Resend, S3, Sentry).
- Usuarios activos = sesiones vigentes, no «personas activas por día» (no se registra actividad diaria).
