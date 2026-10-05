# Energy RD — Monitor de tareas inactivas

## Objetivo
Recordar de forma escalonada las tareas humanas que siguen activas sin evidencia verificable de avance, sin generar mensajes repetidos ni cerrar trabajo automáticamente.

## Fuente de verdad
- Tablero Kanban: `energy-rd`.
- Repositorio remoto: `ManuelDev24/energy-intelligence-rd`.
- Grupo de coordinación Telegram: **Energy RD**.
- El monitor revisa solo tarjetas con estado `ready`, `todo` o `running` y responsable humano explícito.

## Evidencia que reinicia el contador
1. Evento nuevo en Kanban.
2. Push al branch definido en la tarjeta.
3. PR creado o actualizado en el repositorio canónico.

Un PR ya fusionado se excluye de recordatorios aunque la tarjeta todavía requiera reconciliación manual.

## Cadencia y escalamiento
El cron se ejecuta a las **09:00, 12:00, 15:00, 18:00 y 21:00 AST**.

| Inactividad sin evidencia | Acción |
|---|---|
| 18 horas | Primer recordatorio al responsable en el grupo. |
| 36 horas | Segundo aviso: solicitar avance, bloqueo o nueva estimación. |
| 60 horas | Escalación al grupo para que Manuel decida dividir, pausar o reasignar. |

No se marca una tarjeta como terminada por inactividad ni por el texto `listo`. El proceso de PR/revisión sigue siendo obligatorio.

## Implementación
- Perfil: `energyrd-team`.
- Job cron: `08f495f5ea02` — **Energy RD: recordatorios de tareas inactivas**.
- Script activo: `~/.hermes/profiles/energyrd-team/scripts/erd_task_reminders.py`.
- Modo: script-only/no-agent; no usa tokens de IA.
- Estado anti-spam: `~/.hermes/state/erd_task_reminders.json`.

## Asignación automática tras merge

- Job cron: `def64e363159` — **Energy RD: asignar siguiente tarea tras merge**.
- Frecuencia: cada 5 minutos.
- Script activo: `~/.hermes/profiles/energyrd-team/scripts/erd_task_dispatcher.py`.
- Flujo y dependencias: `~/.hermes/profiles/energyrd-team/scripts/erd_task_flow.json`.
- Solo considera terminada una tarea si su branch exacto aparece en un PR **mergeado contra `Dev`** dentro de `ManuelDev24/energy-intelligence-rd`.
- En el siguiente ciclo entrega la próxima tarea cuyas dependencias estén mergeadas; puede entregar una a cada colaborador independiente en el mismo ciclo, sin duplicar asignaciones.
- No usa IA ni créditos. La primera tarea liberada por este flujo fue `ERD-MOB-PILOT` para Manuel después del merge de `ERD-CORE-API`.

## Estado de automatizaciones

Los jobs anteriores de recordatorio y asignación tras merge están **pausados** desde 2026-10-03 porque dependían de feature branches/PRs. El flujo vigente usa commits directos en `Dev` y se documenta en `docs/WORKFLOW_RULES.md`.

Se reactivará un monitor adaptado cuando exista el workflow GitHub **CI**; sin CI, el bot debe rechazar correctamente `listo <ID>` en vez de liberar tareas sin evidencia.

## Operación
- Ver estado: `hermes -p energyrd-team cron list`
- Ejecutar prueba manual: `hermes -p energyrd-team cron run 08f495f5ea02`
- Pausar: `hermes -p energyrd-team cron pause 08f495f5ea02`
- Reanudar: `hermes -p energyrd-team cron resume 08f495f5ea02`
