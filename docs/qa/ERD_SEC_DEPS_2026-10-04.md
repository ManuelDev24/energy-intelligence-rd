# ERD-SEC-DEPS — resultado parcial

## Cambio integrado y probado
- Override acotado `xcode@3.0.1 → uuid@11.1.1`, sin `--force` ni cambios de SDK.
- Generación del lockfile por npm; consumidor real xcode/uuid CommonJS probado: 1000 UUID válidos únicos.
- Auditoría canónica JSON: 21 hallazgos altos, 0 moderados, 0 críticos. Antes: 28 hallazgos, 21 altos y 7 moderados. Advisories únicos: 3 antes, 2 ahora.
- Resuelto uuid GHSA-w5hq-g745-h8pq. Pendientes braces GHSA-vfj7-8cjw-p6xm y node-forge GHSA-86w9-cpqp-85rv: no parche compatible publicado según registro consultado por el trabajador. No equivale a 21 CVE distintos ni demuestra explotación del runtime.

## Verificación del coordinador
- npm test: core 29, contratos 2, cliente 4, web 68, móvil 57; 5 integraciones web y 8 móviles omitidas.
- npm run typecheck y npm run lint: exit 0. Lint solo web tiene script.
- expo install --check: Dependencies are up to date.
- expo-secure-store 57.0.4 añadido para siguiente slice auth móvil, versión compatible SDK57; todavía no equivale a auth UI integrada.
- Build web de baseline y copia del trabajador pasan; compilación nativa/Maestro no reejecutados para este cambio.
- CI remoto no probado; no commit/push.

## Evidencia
- Auditoría coordinador: ~/.hermes/cache/scratch/energy-fullscope-20261004/canonical-audit.json.
- Informe completo del trabajador y propuesta de agrupación por tareas: ~/.hermes/cache/scratch/energy-fullscope-20261004/dependencies/DEPENDENCY_REPORT.md.

## Estado
ERD-SEC-DEPS PARCIAL. No cerrar mientras persistan los avisos altos o hasta documentar formalmente una aceptación de riesgo. Mantener herramientas de desarrollo en entorno confiable y vigilar upstream. No usar downgrades incompatibles para forzar una auditoría verde.
