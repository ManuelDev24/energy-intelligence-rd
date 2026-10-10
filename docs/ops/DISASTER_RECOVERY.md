# Recuperación ante desastres — ERD-OPS-DR

**Estado: herramientas de respaldo cifrado y de restauración verificada listas y probadas en local (10 comprobaciones).
⛔ Sin comprobar contra Neon real: PITR, restauración de una rama, programación diaria del respaldo, almacenamiento
externo del cifrado y rotación de secretos en Render/Neon (requieren las cuentas y ERD-DEPLOY-01).** Las cifras RPO/RTO
de abajo son **objetivos propuestos**, no medidos en producción.

## Qué hay y qué cubre cada capa
| Capa | Qué protege | RPO | Restaurar | Estado |
|---|---|---|---|---|
| Neon PITR / historial de restauración | borrado o migración mala reciente | segundos (WAL continuo) dentro de la ventana: Free 6 h, Launch 7 días | restaurar la rama a un instante o crear una rama desde el pasado (minutos) | ⛔ por verificar en Neon real |
| Respaldo lógico cifrado (`scripts/db_backup.sh`) | pérdida de proyecto/cuenta Neon, corrupción lógica anterior a la ventana de PITR, auditoría | cadencia del respaldo: **diario → 24 h** | `scripts/db_restore_verify.sh` en una base nueva | ✅ probado en local |
| Almacenamiento privado de originales (ERD-STORE-01) | fotos/PDF de facturas | por definir (versionado del bucket) | — | ⛔ no existe aún |

## Respaldo cifrado
```bash
DATABASE_URL=… BACKUP_AGE_RECIPIENT=age1… BACKUP_LABEL=production scripts/db_backup.sh
```
- Solo necesita la **clave pública** `age`: un servidor comprometido no puede leer respaldos antiguos. La clave
  **privada** se guarda fuera (gestor de contraseñas del propietario + copia offline), nunca en Render, CI ni el repo.
- No escribe el volcado en claro (`pg_dump | age`), permisos 600, deja `.sha256` y `.manifest.json` (revisión de Alembic y
  huella del esquema). Genera un archivo nuevo por ejecución; nunca sobrescribe.
- Destino: por ahora `BACKUP_DIR` local. Falta subirlo a un bucket **distinto** del de los originales y de otra cuenta/región
  (R2/S3 con retención de 35 días, propuesta del borrador legal; el borrado de un usuario puede tardar hasta que su
  respaldo caduque, y eso debe decirlo la política de privacidad).
- Programación: un job diario (Render cron o GitHub Actions con la clave pública como secreto) — pendiente.

## Restauración verificada (simulacro)
```bash
AGE_IDENTITY_FILE=/ruta/fuera/del/repo/id.txt RESTORE_ADMIN_URL=postgresql://…/postgres \
  scripts/db_restore_verify.sh energyrd-production-20261010T031700Z.dump.age
```
Comprueba sha256, descifra y restaura en `restore_verify_<hora>_test` (nunca sobre una base existente), y exige: misma
revisión de Alembic, misma huella estructural del esquema, tablas clave legibles, triggers de documentos presentes y
ninguna restricción sin validar (con `STRICT_COUNTS=1`, además mismas filas que el origen). Borra la base al terminar,
incluso si falla. Imprime el tiempo de restauración.

**Autoprueba** (`scripts/test_db_dr.sh`, 10/10): respaldo, volcado no legible en claro, permisos, restauración verificada,
y los fallos que importan — sin clave pública, clave privada usada como destinatario, clave equivocada, archivo manipulado,
manifiesto ausente — no dan "verificada" y no dejan bases huérfanas.
Medida local: respaldo de 63 KB, restauración 0.2 s. **No extrapolar**: hay que repetir el simulacro con el volumen real
de producción y registrar el tiempo.

## Objetivos propuestos (a aprobar por el propietario)
| | Objetivo | Cómo se cumple |
|---|---|---|
| RPO datos recientes | ≤ 5 min | Neon PITR (ventana según plan; **producción en plan Launch**) |
| RPO pérdida total de la cuenta/proyecto | ≤ 24 h | respaldo diario cifrado fuera de Neon |
| RTO base de datos | ≤ 1 h | PITR/rama (minutos) o `db_restore_verify` + cambio de `DATABASE_URL` |
| RTO servicio completo | ≤ 4 h | Blueprint de Render (`render.yaml`) + EAS ya definidos como código |
| Simulacro | trimestral y tras cada cambio grande de esquema | registrar fecha, tiempo y resultado en este archivo |

## Escenarios y primera acción
1. **Migración mala / borrado accidental (<ventana PITR):** detener escrituras (poner la API en mantenimiento o apagar el
   servicio), restaurar la rama Neon al instante anterior (o crear una rama desde ese instante y apuntar `DATABASE_URL`),
   verificar con `alembic current` y un smoke, reanudar. Las migraciones son transaccionales en PostgreSQL; aun así
   probar siempre en staging.
2. **Pérdida del proyecto/cuenta Neon:** crear proyecto nuevo, `scripts/db_restore_verify.sh` sobre el último respaldo,
   restaurar de verdad con `pg_restore` en la base real (paso manual, deliberado), `alembic upgrade head` si el esquema
   quedó atrás, actualizar `DATABASE_URL` en Render.
3. **Pérdida de Render:** recrear con el Blueprint (`render.yaml`); los secretos están en el gestor del propietario.
4. **Credenciales comprometidas:** ver rotación abajo; revocar sesiones cambiando `AUTH_SIGNING_KEY`.
5. **Archivos de originales borrados/corruptos:** depende de ERD-STORE-01 (versionado y comprobación de `sha256` por
   documento: la huella ya está registrada en `documents`).

## Rotación de secretos
Ninguno de estos cambios se ha ensayado en Render/Neon (⛔ requiere las cuentas). Efecto y orden:
| Secreto | Efecto de rotarlo | Pasos |
|---|---|---|
| `AUTH_SIGNING_KEY` | Se cierran **todas** las sesiones y se reinician los contadores anti-abuso (es también la clave HMAC de los buckets) | generar `secrets.token_urlsafe(48)`, actualizar en Render, redeploy; avisar a los usuarios de que deberán iniciar sesión |
| `DATABASE_URL` (clave del rol) | Caída hasta que la API reinicia con la nueva | Neon: reset de contraseña del rol → Render: actualizar → redeploy; probar `/health` |
| `BFF_API_SHARED_SECRET` | Hasta que web y API tengan el mismo valor, la IP firmada del navegador no se verifica y se usa la IP de transporte | cambiar API y web **en la misma ventana**; no aplica si `CLIENT_IP_SOURCE=socket` |
| `RESEND_API_KEY` | Sin cambio si se hace en orden | crear clave nueva → actualizar Render → comprobar un correo de recuperación → borrar la anterior |
| `SENTRY_DSN` | Eventos nuevos al DSN nuevo | rotar en Sentry, actualizar Render |
| Clave `age` de respaldo | Los respaldos nuevos usan la clave nueva | generar par nuevo, cambiar `BACKUP_AGE_RECIPIENT`, **conservar la identidad anterior hasta que expiren los respaldos cifrados con ella** |
| Tokens de EAS / Expo | Compilaciones fallan hasta actualizar | revocar y crear en expo.dev, actualizar el secreto de CI |

## Pendiente (todo requiere acceso del propietario)
Verificar PITR/restauración de rama en Neon; elegir bucket de respaldos externo y programar el job diario; guardar la clave
privada `age` (gestor + copia offline); ensayar una rotación de `AUTH_SIGNING_KEY` en staging; primer simulacro real con
datos de producción y registro del tiempo; añadir `scripts/test_db_dr.sh` a CI una vez verificado en Actions.
