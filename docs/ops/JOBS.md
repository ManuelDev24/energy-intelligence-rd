# Trabajos en segundo plano (ERD-WORKER-01)

## Decisión: cola en PostgreSQL, no Redis (por ahora)
El plan decía «Redis + workers». Se implementó la cola **sobre PostgreSQL** (`jobs`, migración 0017) por estas razones, que
la persona dueña del proyecto puede revertir:

| | PostgreSQL (hecho) | Redis |
|---|---|---|
| Infraestructura nueva | ninguna (la BD ya es la fuente de verdad y tiene backups) | un servicio más (Render Key Value / Upstash), costo y credenciales |
| Encolar junto con datos de negocio en **un solo commit** | sí (`enqueue(..., commit=False)`) | no (riesgo de trabajo perdido o fantasma) |
| Reparto sin duplicar | `FOR UPDATE SKIP LOCKED` | listas/streams |
| Latencia | sondeo cada ~2 s (suficiente para OCR, correos, mantenimiento) | milisegundos |
| Volumen cómodo | decenas de miles de trabajos/día | muy superior |

Si algún día el volumen o la latencia lo exigen, la frontera es `app/services/jobs/queue.py` (`enqueue/claim/complete/fail`):
se sustituye ahí sin tocar handlers ni programador. `docker-compose.yml` conserva el servicio `redis` (perfil `jobs`) sin uso.

## Garantías
- **Al menos una vez**: un trabajo puede ejecutarse más de una vez (worker muerto, tiempo agotado). **Todo handler debe ser idempotente.**
- **Idempotencia al encolar**: `(kind, idempotency_key)` es único; repetir devuelve el existente (p. ej. clave = id del documento, o `sched:<hueco>`).
- **Concesión (lease)**: al tomar un trabajo se reserva `tiempo máximo del handler + 30 s`. Si vence, otro worker lo retoma y cuenta como intento. El resultado tardío del primero se **descarta** (cierre cercado por worker + intento).
- **Tiempo máximo**: SIGALRM interrumpe el handler (no puede tragárselo con `except Exception`). Si queda bloqueado en código nativo, vence la concesión.
- **Reintentos**: espera `30 s·2^(n-1)` con tope de 1 h y ±20 % de azar; `RetryLater(seg)` fija la espera; `PermanentFailure` va directo a muertos. Máximo de intentos por tipo (5 por defecto, 1–20).
- **Muertos (dead-letter)**: quedan en `jobs` con `status='dead'` y el último error (sin datos personales: se redactan correos, JWT y tokens). Se reportan a Sentry (sin payload). Reintento manual: `python -m scripts.jobs requeue <id>`. Se borran a los 90 días.
- **Payload**: solo identificadores, máximo 8 KB, objeto JSON (lo exige la base). Nunca contenido de facturas, correos ni texto OCR.
- **Programador sin líder**: cada worker encola el «hueco» vigente de cada tarea periódica; la clave única evita duplicados. Tras una caída no se acumula atraso: se encola solo el hueco actual.

## Tareas integradas
| Tipo | Frecuencia | Qué hace |
|---|---|---|
| `storage.maintenance` | 10 min (solo con almacenamiento configurado) | expira originales sin factura, borra objetos encolados, limpia la cola de borrado |
| `jobs.purge` | diaria | borra trabajos terminados (7 días) y muertos (90 días) |

Nuevos módulos registran lo suyo con `@register("modulo.tarea", timeout_seconds=…, max_attempts=…)` (ver `app/services/jobs/handlers.py`) y añaden su `Schedule` en `schedules()`.

## Operación
```
python -m app.worker           # continuo; SIGTERM termina el trabajo en curso y sale (código 0)
python -m app.worker --once    # procesa lo vencido y sale (para un cron)
python -m scripts.jobs stats   # JSON; sale con 1 si hay muertos o concesiones vencidas
python -m scripts.jobs dead    # muertos sin payload
python -m scripts.jobs requeue 42
```
En la imagen de la API: `./docker-entrypoint.sh python -m app.worker`. Un proceso ejecuta un trabajo a la vez; más paralelismo = más procesos.

**Despliegue (pendiente, requiere cuenta del dueño; ver ERD-DEPLOY-01):** en Render, un *Background Worker* (plan de pago) con ese comando, o un *Cron Job* cada 5 min con `--once` (más barato, latencia de hasta 5 min). `render.yaml` **no** lo incluye todavía.

**Alertas sugeridas (sin configurar, ERD-OBS-01):** `dead > 0`; `oldest_queued_age_seconds > 300`; `stuck > 0`.

## Verificado y no verificado
- Verificado: `tests/test_jobs.py` (38; incluye carreras de 8 hilos al encolar y 5 workers al reclamar, tiempo máximo real con SIGALRM, concesión vencida, descarte de resultado tardío, migración ida y vuelta) y una corrida manual de `python -m app.worker --once` y de SIGTERM en modo continuo contra PostgreSQL local.
- **No verificado**: ejecución en Render, comportamiento bajo carga real, `--once` desde un cron real, ni la integración con Sentry de un trabajo muerto contra un DSN real (probado con un doble).
- Los handlers de OCR, anomalías, correos y push **aún no existen**: los registran ERD-OCR-PROD, ERD-ANOM-01-COMPLETE y ERD-ALERT-02.
