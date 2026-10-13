# Reglas de asignación de tareas — Energy RD

**Vigentes desde 2026-10-03.**

## Repositorio y ramas

- Repositorio único: `ManuelDev24/energy-intelligence-rd`.
- Ramas permitidas: `Dev` (trabajo diario), `QA` (pruebas) y `main` (releases).
- Todas las tareas se implementan directamente en `Dev`.
- Solo Manuel promueve `Dev → QA → main`.

## Prohibiciones

- No crear ramas `feat/`, `fix/`, `chore/` ni ninguna rama de trabajo adicional.
- No abrir PRs hacia `main` ni `QA`.
- No hacer push a `main` o `QA`.
- No usar `git push --force` sobre `Dev`.
- No subir `.env`, tokens, contraseñas ni otros secretos.

## Formato de asignación

```text
TAREA <ID>
Responsable: <nombre>
Rama: Dev
Objetivo: <una frase>
Aceptación:
- <check 1>
- <check 2>
- <check 3>
Dependencias: <IDs o "ninguna">
Antes de empezar: git checkout Dev && git pull origin Dev
Commits: cada commit debe incluir [<ID>] descripción
Al terminar: git pull --rebase origin Dev && git push origin Dev
```

## Reporte de finalización

```text
listo <ID>
Commit: https://github.com/ManuelDev24/energy-intelligence-rd/commit/<sha>
```

## Reportes privados al bot

Los colaboradores reportan por DM a `@energyrd_team_bot`, no en el grupo. El bot interpreta mensajes normales en español como avance, bloqueo, pregunta o intento de finalización.

Ejemplos aceptados:

```text
Avance ERD-API-INSIGHTS: ya terminé equipos, me faltan alertas.
```

```text
Estoy bloqueado en ERD-WEB-SHELL-BILLS: npm ci falla por package-lock.
```

```text
Terminé ERD-WEB-ENERGY. Commit: https://github.com/ManuelDev24/energy-intelligence-rd/commit/<sha>
```

Un `listo` sin ID y URL de commit requiere aclaración. El bot mantiene los avances y bloqueos privados; solo te notifica por privado una finalización verificada o un bloqueo que requiera tu decisión.

Para recibir DM, cada colaborador debe abrir el chat con el bot, pulsar **Start** y enviar un mensaje normal (no solo `/start`).

## Verificación del bot

Al recibir un reporte, el bot debe ejecutar:

```bash
./scripts/verify_task_commit.sh <ID> <commit-url-o-sha>
```

El verificador exige:

1. Que el commit pertenezca al repositorio canónico.
2. Que esté contenido en `Dev`.
3. Que el mensaje incluya `[ID-DE-TAREA]`.
4. Que el workflow de GitHub **CI** haya finalizado con éxito para ese commit o uno posterior de `Dev`.

Si algo falla, el bot responde `RECHAZADO` con el motivo y conserva la tarea activa. Si todo pasa, la mueve a revisión, avisa a Manuel por privado y puede liberar la siguiente tarea dependiente.

## Evidencia de CI

El checkout incluye `.github/workflows/ci.yml`, workflow **CI**. Su existencia local no demuestra
que una ejecución remota haya terminado correctamente. El verificador debe comprobar el estado
remoto del commit antes de aceptar una finalización; sin esa evidencia conserva la tarea activa.
