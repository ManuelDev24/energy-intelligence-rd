# Retención de datos y datos personales en la base (auditoría C-15)

## Plazos aplicados por el sistema (trabajo diario `maintenance.retention`)

Cifras **propuestas**: deben coincidir con el aviso de privacidad cuando se apruebe (tarea ERD-LEGAL-FINAL). Se cambian con variables de entorno.

| Qué | Se borra cuando | Variable (por defecto) |
|---|---|---|
| Sesiones (y sus refresh tokens) | vencida o revocada hace más de N días | `RETENTION_SESSION_DAYS` (30) |
| Contadores anti-abuso (HMAC de IP/correo) | ventana iniciada hace más de N días | `RETENTION_ABUSE_BUCKET_DAYS` (7) |
| Invitaciones (guardan el correo de un tercero) | aceptada, revocada o vencida hace más de N días | `RETENTION_INVITATION_DAYS` (90) |
| Registro de avisos enviados | creado hace más de N días (no pendientes) | `RETENTION_NOTIFICATION_DAYS` (365) |
| Alertas descartadas | creadas hace más de N días | `RETENTION_DISMISSED_ALERT_DAYS` (365) |
| Historial de cambios (`audit_events`) | creado hace más de N días | `RETENTION_AUDIT_DAYS` (730) |
| Tokens de recuperación, trabajos terminados, originales sin confirmar | ya existían (ver `PASSWORD_RECOVERY.md`, `docs/ops/JOBS.md`, `STORAGE.md`) | — |

Borra en lotes de 1 000 filas con commit entre lotes (no retiene bloqueos largos). Lo ejecuta el worker (rol `erd_worker`).

## Historial de cambios sin copias de datos personales

- `audit_events.actor_user_id` registra **quién** hizo el cambio (antes `actor` era siempre `pilot`). Al borrar la cuenta queda en NULL y `actor` se seudonimiza.
- `account_number`, `address`, `city`, `sector`, `province` y `municipality` se guardan como `[redacted:xxxxxx]`: el sufijo es un HMAC corto con la clave
  de la aplicación, suficiente para ver *si* cambió un valor, no *cuál* era. La migración `0026` reemplazó los valores ya guardados por `[redacted]`.

## Cifrado de columnas con datos personales (DB-03) — decisión pendiente del dueño

`contracts.account_number` y la dirección de `homes` siguen **en claro** en sus tablas (sí están protegidas por la RLS y ya no se copian al historial).
Opciones: (a) aceptar el cifrado en reposo del proveedor (Neon cifra el almacenamiento; **no verificado** desde este repositorio) o (b) cifrado de aplicación
con las claves versionadas de `STORAGE_ENCRYPTION_KEYS` (coste: búsqueda/orden por esos campos imposibles, riesgo de pérdida si se pierden las claves).
Recomendación: (a) para el piloto, documentada en el aviso de privacidad, y (b) si se tratan datos a escala. **Requiere aprobación de Manuel.**

## Respaldos y derecho de supresión (DB-07)

Un respaldo conserva datos de cuentas ya borradas hasta que caduca (propuesta 35 días, `docs/ops/DISASTER_RECOVERY.md`). Tras restaurar un respaldo hay que
volver a aplicar los borrados de cuenta solicitados después de la fecha del respaldo. Debe constar en el aviso de privacidad (ERD-LEGAL-FINAL).
