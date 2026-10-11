# Observabilidad — ERD-OBS-01

**Estado: API lista y probada (errores + trazas con redacción). ⛔ Pendiente: cuenta/proyecto de Sentry y DSN, web
(Next.js) y móvil (Expo), reglas de alerta y panel, y verificar con un error real en staging.**

## Qué existe (API)
- Log JSON por petición con `request_id` (ya existía) y `X-Request-ID` en cada respuesta.
- Sentry opcional (`app/telemetry.py`): sin `SENTRY_DSN` no se envía nada. Con DSN: errores 500 (el middleware los
  reporta explícitamente con la etiqueta `request_id`) y trazas de rendimiento con `SENTRY_TRACES_SAMPLE_RATE` (0.05).
  Los errores controlados (400/401/403/404/409/422/429) **no** se reportan.
- **Redacción antes de salir** (`scrub_event`, 10 pruebas): sin cuerpos, cookies, cabeceras (solo `User-Agent` y
  `X-Request-ID`), query string, IP, usuario, nombre del servidor, variables locales ni líneas de código fuente de los
  frames; correos, JWT, `Bearer …` y tokens opacos de 43 caracteres sustituidos por `[Filtered]`; valores bajo claves
  como `password`, `token`, `email`, `account_number`, `address`, `raw_text_excerpt`, `ip_address`.
  Si la redacción fallara, sale un evento mínimo (nunca el original).
- `LoggingIntegration` apagada para no duplicar cada `logger.exception` como evento; `send_default_pii=False`.

## Qué existe (worker de trabajos)
- El worker (`python -m app.worker`) inicia la misma telemetría (`init_telemetry`): sin DSN no envía nada.
- Un trabajo que llega a «muerto» (agotó reintentos) se reporta a Sentry con **solo** tipo, id y el error ya redactado
  (`scrub_text`: correos, JWT, `Bearer`, tokens). Probado con un doble de Sentry; **no** contra un DSN real.
- Estado de la cola a demanda: `python -m scripts.jobs stats` (JSON; sale con 1 si hay muertos o concesiones vencidas).
- Alertas sugeridas (sin configurar, requieren cuenta): `dead > 0`; `oldest_queued_age_seconds > 300`; `stuck > 0`;
  `storage_reconcile` con salida 1 (documentos sin objeto).

## Variables
| Variable | Secreto | Notas |
|---|---|---|
| `SENTRY_DSN` | No fuerte, pero no se imprime (`repr=False`) | Opcional. Debe ser `https://`. Un proyecto Sentry por entorno. |
| `SENTRY_TRACES_SAMPLE_RATE` | No | 0–1, por defecto 0.05. Subir solo con presupuesto de eventos. |

## SLO propuestos (a validar con tráfico real; hoy no hay datos de producción)
| Indicador | Objetivo | Ventana | Fuente |
|---|---|---|---|
| Disponibilidad de la API (`/health` 200 y respuestas ≠ 5xx) | 99.5 % | 30 días | Render health check + Sentry |
| Latencia p95 de lecturas (`GET /homes/*`, `/dashboard`) | < 500 ms | 7 días | Sentry Performance / log `duration_ms` |
| Latencia p95 de escrituras (facturas, lecturas) | < 800 ms | 7 días | ídem |
| OCR (`POST /bills/ocr`) p95 | < 15 s | 7 días | ídem (Tesseract en CPU compartida) |
| Correo de recuperación entregado a Resend | 99 % | 30 días | log `email_delivery_failed` |
| Errores 5xx | < 0.5 % de las peticiones | 7 días | Sentry |

Staging en Render Free duerme a los 15 min: **no se mide SLO en staging**; solo producción (Starter).

## Alertas propuestas (configurar en Sentry/Render cuando existan las cuentas)
1. Evento nuevo de nivel `error` en `production` → aviso inmediato.
2. > 5 errores 5xx en 5 min, o tasa 5xx > 2 % en 10 min → página.
3. Health check de Render fallando 3 veces seguidas → página.
4. `email_delivery_failed` ≥ 3 en 15 min → aviso (los usuarios no reciben enlaces de recuperación).
5. p95 de latencia por encima del objetivo 30 min seguidos → aviso.
6. Cualquier evento que contenga un valor sin redactar (revisión semanal de una muestra) → incidente de privacidad.

## Cómo diagnosticar con un reporte de usuario
El usuario ve el `request_id` en el mensaje de error de la API → buscar esa etiqueta en Sentry y ese valor en los logs
de Render. Nunca pedir capturas con tokens ni el cuerpo de la petición.

## Pendiente y por qué
| Pendiente | Bloqueo |
|---|---|
| Proyecto y DSN de Sentry (staging y production) | requiere la cuenta del propietario |
| Web: `@sentry/nextjs` con el mismo filtro (el BFF ve cookies y tokens, hay que probarlo con cuidado) | pide DSN para probarlo extremo a extremo |
| Móvil: `@sentry/react-native` + `beforeSend` equivalente; EAS | pide DSN y compilación nativa |
| Reglas de alerta, panel y SLO reales | requieren tráfico en producción |
| Verificación con un error provocado en staging | requiere el despliegue (ERD-DEPLOY-01) |
