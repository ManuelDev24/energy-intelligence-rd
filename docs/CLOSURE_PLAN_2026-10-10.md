# Plan de cierre — antes de los módulos nuevos

Fecha: 10 de octubre de 2026. Sustituye el orden por bloques propuesto el mismo día, tras contrastarlo con el código.
Regla: se cierra lo iniciado antes de empezar Copilot, administración, IoT, solar y plataforma nacional.

## Estado real verificado (commit `b7e54a4`)

| Área | Estado |
|---|---|
| OCR | No existe. Solo hay rechazos explícitos de `source="ocr"`. Es un módulo nuevo, no un cierre. |
| Documentos / storage | No existe tabla `documents` ni storage de archivos. |
| Workers / Redis | Redis solo como servicio opcional (`--profile jobs`). Sin código de workers. |
| Anomalías | No existen. |
| Alertas | Solo `bill_variation`; severidades `warning` y `critical`. |
| Recuperación de contraseña | Pendiente (ver `task_plan.md`, ERD-AUTH-03). |
| Compartir vivienda | Solo roles `owner` y `member`; sin invitaciones ni transferencia. |

Consecuencia: OCR, workers, storage y anomalías se construyen después del release del piloto. Las tareas 1, 4 y 20 del
plan original (pruebas y producción de OCR) se fusionan al final, porque no se puede probar OCR antes de construirlo.

## Orden de ejecución

### Etapa A — Cerrar lo parcial (sin OCR)

| Orden | ID | Nota |
|---:|---|---|
| A1 | ERD-AUTH-03 | **Añadida.** Recuperación de contraseña y cambio de contraseña. Bloquea el Maestro de recuperación y ERD-PROF-01. |
| A2 | ERD-PROJECTION-METRIC-API | Mover `projectionDeltaPct` y cálculos duplicados al backend; resultado `PROJECTED`. Va primero porque cambia contratos que usan web y móvil. |
| A3 | ERD-ONB-ACCEPTANCE | Onboarding autenticado: vivienda, contrato y meta inicial. |
| A4 | ERD-PROF-01 | Cambio de contraseña, notificaciones, idioma, unidades. |
| A5 | ERD-UI-KIT | Componentes pendientes; decidir si `packages/ui` se implementa o se elimina del diseño. |
| A6 | ERD-CHARTS-01 | Rango personalizado, comparación, días de factura, ciclo actual, mini-tendencias móviles. |
| A7 | ERD-SHARE-01 | Invitaciones, revocación, transferencia y borrado con propietario único. |
| A8 | ERD-A11Y-NATIVE | Lector de pantalla, foco, contraste, estados y áreas táctiles. |
| A9 | ERD-E2E-MAESTRO-AUTH | iOS y Android: auth, onboarding, perfil, consumo, metas y recuperación. Sin OCR. |

### Etapa B — Producción y seguridad

| Orden | ID | Nota |
|---:|---|---|
| B1 | ERD-LEGAL-FINAL | Privacidad, términos, ARCO, retención, proveedores. |
| B2 | ERD-SEC-DEPS-MONITOR | Documentar los 20 avisos altos aceptados; sin `--force`. |
| B3 | ERD-DEPLOY-01 | Neon, Render, EAS, dominio, TLS, secretos, correo, smoke remoto. |
| B4 | ERD-OBS-01 | Sentry/APM, métricas, SLO, redacción de datos personales. Después del despliegue. |
| B5 | ERD-OPS-DR | Backups cifrados, restauración, PITR, RPO/RTO, rotación de secretos. |

### Etapa C — Release del piloto

| Orden | ID | Nota |
|---:|---|---|
| C1 | ERD-RELEASE-QA | Pruebas completas, CI verde, checklist, promoción `Dev → QA` (la hace Manuel). Sin OCR. |

### Etapa D — Infraestructura de documentos

| Orden | ID | Nota |
|---:|---|---|
| D1 | ERD-STORE-01 | Storage privado S3/R2, cifrado, URLs firmadas, retención, borrado. |
| D2 | ERD-WORKER-01 | Redis y workers: reintentos, idempotencia, timeout, scheduler, dead-letter. |
| D3 | ERD-DB-DOCUMENTS | Modelo `documents`, procedencia, retención y borrado. |

### Etapa E — Inteligencia

| Orden | ID | Nota |
|---:|---|---|
| E1 | ERD-OCR-PROD | OCR asíncrono, estados, reintentos, PDF multipágina, conserva el original. |
| E2 | ERD-OCR-REAL-QA + ERD-BILL-LIVE-QA | Facturas reales anonimizadas de EDESUR, EDENORTE y EDEESTE; web y móvil contra la API. |
| E3 | ERD-ANOM-01-COMPLETE | Anomalías persistidas, confianza, picos, consumo nocturno, caídas, job y deduplicación. |
| E4 | ERD-ALERT-02 | Cuatro severidades, alertas de pago/anomalía/datos incompletos, push, correo, preferencias. |
| E5 | ERD-DEV-02 | Marca, modelo, tipo, icono y porcentaje de consumo por equipo. |

Después de la etapa E: Copilot, administración, IoT (Smart Connect), solar y plataforma nacional.

## Reglas para esta serie

- Cada tarea lleva criterios de aceptación y pruebas propias antes de darse por cerrada.
- Un baseline verde no equivale a cerrar una tarea; la evidencia nativa, de CI remoto o de despliegue se registra aparte.
- No se mezclan datos simulados con datos reales; no se inventan tarifas ni telemetría.
- Commits con `[ID]` en el mensaje. La promoción a QA/main la decide Manuel.
