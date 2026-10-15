# Energy Copilot (ERD-AI-CHAT, 2026-10-14)

Asistente conversacional de la web (`/copilot`) que responde sobre consumo, facturas, equipos y ahorro **solo con los datos registrados de la
vivienda**, indicando la calidad de cada cifra. Es de solo lectura: no crea, cambia ni borra datos y no confirma facturas.

## Piezas

| Capa | Dónde | Qué hace |
|---|---|---|
| Modelo y RLS | `backend/api/app/models/copilot.py`, migración `0032` | `copilot_conversations` (de una vivienda **y** de una persona: otro miembro de la misma casa no la ve), `copilot_messages` (heredan la visibilidad), `copilot_usage` (cuota diaria por persona). |
| Herramientas | `app/services/copilot/tools.py` | 9 herramientas de solo lectura que **reutilizan** los servicios de dashboard, facturas, consumo, equipos, recomendaciones, tarifa, score, apagones y meta. Entrada validada con Pydantic (`extra=forbid`); cada resultado trae fuentes con calidad (`REAL`/`ESTIMATED`/`PROJECTED`/`INFERRED`) y enlace interno. |
| Proveedor | `app/services/copilot/provider.py` | `AnthropicProvider` (SDK oficial, `claude-opus-5-5`, pensamiento adaptativo, esfuerzo `medium`, `fallbacks: "default"`) y `FakeProvider` (determinista, sin red, solo `development`). |
| Motor | `app/services/copilot/engine.py` | Cuota → pregunta guardada → bucle modelo/herramientas (máx. 6 rondas) con texto en streaming → respuesta guardada con fuentes, herramientas, tokens y estado (`complete`/`cancelled`/`error`/`refused`). Sin transacción abierta mientras responde el modelo. |
| API | `app/api/v1/copilot.py` | `GET usage`, CRUD de conversaciones, `GET messages`, `POST messages` (SSE), `PUT …/feedback`. Detrás de `authorize_home`. |
| BFF web | `frontend-web/app/src/lib/auth/bff*.ts` | Rutas JSON con esquemas estrictos; el envío reenvía el stream solo si es `text/event-stream`, con tope de 512 KB y corte si la persona cancela. |
| Interfaz | `frontend-web/app/src/features/copilot/` | Conversaciones, compositor, streaming, detener/reintentar, acciones rápidas, fuentes con calidad, valoración, uso diario, sin conexión, límite alcanzado. |
| Lógica compartida | `packages/core/src/copilot.ts` | Acciones rápidas, lector SSE y **Markdown seguro** (reutilizable por el móvil). |

## Seguridad

- **Datos**: la herramienta recibe la vivienda del contexto autenticado; el modelo nunca elige `home_id`. Una entrada con campos extra se rechaza.
- **Inyección**: los resultados de herramientas se tratan como datos (el prompt lo indica) y el Copilot no tiene herramientas de escritura.
- **Render**: el texto del modelo nunca se inserta como HTML. Un subconjunto cerrado de Markdown se convierte en nodos React; solo se enlazan rutas
  internas permitidas (`safeInternalHref`); `https://…`, `javascript:` y `//host` quedan como texto.
- **Lo que no sale**: prompt del sistema, razonamiento interno, resultados crudos de herramientas, errores del proveedor y claves. El
  navegador solo ve mensajes locales; la API loguea el tipo de error, no su texto.
- **Límites**: `COPILOT_DAILY_MESSAGES_PER_USER` (40) y `COPILOT_DAILY_TOKENS_PER_USER` (400 000) por persona y día de RD; 429 con
  `Retry-After`. Máx. 200 conversaciones por persona, 4000 caracteres por pregunta.
- **Rechazos del modelo** (`stop_reason: "refusal"`): se muestran con un mensaje propio; `fallbacks: "default"` reintenta en el modelo
  recomendado dentro de la misma llamada.

## Configuración

| Variable | Valor | Nota |
|---|---|---|
| `COPILOT_PROVIDER` | `disabled` (por defecto) · `anthropic` · `fake` | `fake` solo en `development` (la configuración lo rechaza en staging/producción). Con `disabled` las rutas devuelven 503 y la web lo explica. |
| `ANTHROPIC_API_KEY` | **secreto** | Obligatoria con `anthropic`. Distinta por entorno; nunca en git, chat ni capturas. |
| `COPILOT_MODEL` / `COPILOT_EFFORT` | `claude-opus-5-5` / `medium` | `low`–`high`. |
| `COPILOT_DAILY_*`, `COPILOT_MAX_*` | ver `config.py` | Límites de uso. |

## Pendiente (no se afirma como hecho)

1. **No se ha probado contra Claude real**: las pruebas usan el proveedor determinista y un cliente simulado que verifica la forma exacta de
   la petición. Hace falta una corrida con `ANTHROPIC_API_KEY` en staging (costo real) para medir calidad, latencia y costo por pregunta.
2. **Privacidad**: con `anthropic`, las preguntas y los datos que devuelven las herramientas (consumos, montos, nombres de equipos) viajan a
   Anthropic. Antes de producción hay que reflejarlo en la política de privacidad (hoy en BORRADOR, C-04) y decidir la retención.
3. **Supervisión administrativa** (ERD-AI-ADMIN-WEB): los tokens, el estado y la latencia ya se guardan por mensaje, pero `frontend-web/admin` aún no
   tiene pantalla de uso, costos ni conversaciones marcadas; hacerlo sin exponer contenido privado requiere un scope propio y auditoría.
4. **Moderación propia y feedback agregado** se apoyan hoy solo en los clasificadores del proveedor y en la valoración útil/no útil.
5. La app móvil aún no tiene pantalla del Copilot (reutilizaría `api-client`, el lector SSE y el Markdown de `core`).
