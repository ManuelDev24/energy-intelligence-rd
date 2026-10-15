# Alertas, avisos y pago (ERD-ALERT-02)

Migración `0020`. Qué se alerta, a quién se avisa y por qué canal. Detalle del motor de anomalías en `ANOMALIES.md`; trabajos en `docs/ops/JOBS.md`.

## Tipos y severidades
Cuatro severidades: `critical`, `warning`, `info`, `savings` (el ahorro es una buena noticia: nunca se envía).

| Tipo | Cuándo | Severidad |
|---|---|---|
| `bill_variation` | el kWh de una factura sube respecto a la anterior (umbrales por vivienda); o **baja ≥ 20 %** | `warning`/`critical`; `savings` |
| `anomaly` | una anomalía **reciente** (día ≤ 14 días; mes/factura ≤ 45 días), vigente y no descartada | la de la anomalía (`info`/`warning`/`critical`) |
| `payment_due` | la factura **más reciente** tiene fecha límite, no está pagada y vence en ≤ 7 días o ya venció (hasta 180 días) | ≤ 7 d `info` · ≤ 3 d `warning` · vencida `critical` |
| `missing_bill` | pasó un ciclo (+7 días) desde el cierre de la última factura sin otra | `info`; `warning` tras dos ciclos |
| `stale_readings` | ≥ 2 lecturas registradas y la última tiene ≥ 14 días | `info` |

Honestidad: **sin fecha límite no hay alerta de pago** (no se infiere); solo la última factura puede estar pendiente (así capturar facturas viejas no genera «vencidas»); lo viejo se lista pero no avisa; lo informativo/incompleto **nunca** se envía.

## Fecha límite y pago
`bills.due_date` (opcional; entre el inicio del período y 120 días después del fin) y `bills.paid_at`. `PUT /homes/{id}/bills/{bill}/payment {paid}` marca pagada/pendiente (idempotente) y retira/restituye la alerta de pago al instante. El OCR intenta leer la fecha límite (`due_date` del borrador; patrones sin verificar con facturas reales; si no es coherente con el período se descarta con una advertencia). Web y móvil: campo opcional en el formulario y botón «Marcar como pagada/pendiente» en el detalle.
**Límite conocido:** pagar y deshacer crea una alerta nueva y por tanto vuelve a avisar una vez.

## Cuándo se evalúa
Tras crear/editar/borrar facturas y lecturas (en la misma transacción, en un SAVEPOINT: un fallo nunca pierde el dato del usuario), tras cada escaneo de anomalías, y a diario por el trabajo `alerts.evaluate_all` → `alerts.evaluate_home` (las reglas por fecha cambian aunque nadie escriba). Cada alerta nueva o que **escala de severidad** genera avisos; reevaluar no repite.

## Avisos (correo y push)
- Solo `warning`/`critical` de los tipos `bill_variation`, `anomaly` y `payment_due`, y solo si son recientes. A **todas** las personas de la vivienda.
- Una fila `notifications` por (alerta, persona, canal, severidad): única. Estados `pending → sent | failed | skipped` con motivo (`preference`, `dismissed`, `daily_cap`, `no_device`, `no_valid_device`, `delivery_error`).
- **Preferencias** (`alerts_email`, `alerts_push`): se aplican al encolar y otra vez al enviar. Tope de `NOTIFY_DAILY_CAP` (10) por persona y canal cada 24 h; lo que excede se omite pero sigue en la app.
- **Correo**: asunto y cuerpo **sin cifras ni montos** (solo el tipo de aviso, el nombre de la vivienda y un enlace a `/alerts`); pie con cómo desactivarlo. Se envía con el backend de correo configurado (`EMAIL_BACKEND`).
- **Push**: tokens de Expo en `device_tokens` (`PUT /auth/devices`, `POST /auth/devices/remove`; máx. 10 por persona; un token pasa a la última cuenta que lo registra). Se envía por el servicio de Expo (`EXPO_ACCESS_TOKEN` opcional); `DeviceNotRegistered` borra el token; 429/5xx reintentan. El título es genérico y el cuerpo no lleva cifras.
- Reintentos: 5 con espera creciente (cola de trabajos); al agotarlos queda `failed`.
- Sin worker no salen avisos (las alertas siguen apareciendo en la app).

## Estados coherentes
Las alertas de anomalía y su anomalía comparten estado: marcar leída ↔ revisada, descartar en una descarta la otra, resolverse retira la alerta.

## Datos personales
`device_tokens` y `notifications` entran en la exportación (el token **no**), se borran en cascada con la cuenta y se listan en `docs/legal/PRIVACY_AND_RETENTION_DRAFT.md`.

## Verificado y no verificado
- Verificado: reglas puras (9), integración con base real (35: ciclo del pago, escalada, ahorro, datos incompletos, anomalías enlazadas, fan-out, preferencias, tope diario, correo y push con remitentes simulados, cliente de Expo con transporte simulado, dispositivos, trabajos, restricciones de base y migración), BFF, cliente, web (7 + formularios), móvil (lógica y estructura) y una corrida en navegador real con worker y bandeja de correo de desarrollo (`docs/qa/evidence/alert-02-2026-10-11/`, 15/15).
- **No verificado**: envío de correo por un proveedor real (solo la bandeja de desarrollo y un transporte simulado de Resend ya existente); **todo el push** (necesita un dispositivo, un build con credenciales FCM/APNs en EAS y `extra.eas.projectId`; hoy solo hay código y pruebas con dobles); la lectura de la fecha límite en facturas reales; los umbrales (7/3 días, 20 % de ahorro, 14 días de lecturas) son puntos de partida; la entrega bajo carga.
