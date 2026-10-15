# ERD-WEB-POSTMERGE-QA — revisión cruzada del cierre web

Fecha: 2026-10-11, America/Santo_Domingo. Base revisada: `Dev`, `e208db8`.

## Discrepancias y correcciones

| Evidencia / afirmación | Resultado de la revisión |
|---|---|
| Cierre de Jonas del 2026-10-07 | Su informe declara PARCIAL y utiliza `simulated-api.mjs`. Sus 485 pruebas y cinco omisiones no certifican API/PostgreSQL reales. No atribuirle el cierre posterior de Manuel del 2026-10-10. |
| H1 pendiente en POSTMERGE, y simultáneamente abierto/resuelto en WEB-QUALITY | Estado documental corregido. `DashboardPage` consume `projection.kwh_pct_vs_latest`; las pruebas fijan 99.00 frente al 15.87 que produciría el cliente y comprueban ausencia cuando la API devuelve null. |
| H5: input de archivo oculto enfocable | Su acceso por teclado es necesario, pero la etiqueta visible carecía de indicador de foco. Se añade `focus-within` y altura mínima de 44 px, conservando el input nativo. |
| H6 identificado como dos tarjetas de error | H6 original describe una espera superior a 8 s, no dos tarjetas. Se corrige la identificación; la observación de tarjetas independientes se conserva aparte. El resultado posterior de 1.3 s no garantiza latencia en todos los entornos. |
| H7: texto crudo de error | Ya corregido en Dev: `QueryState` usa `userMessage`. Regresión existente comprueba que SECRET-UPSTREAM y texto de excepciones no llegan a pantalla. |
| Accesibilidad completa | El informe posterior tiene axe sin violaciones en 11 rutas, pero no lector de pantalla real. El informe histórico de Jonas tampoco midió contraste y colocó el foco por script en algunos pasos: no equivale a un recorrido íntegro por teclado. |
| 90/90 y 777/777 | Son evidencias históricas distintas: navegador del 2026-10-10 y suite contra API aislada del 2026-10-11. No sumar ni presentar como ejecutadas en esta revisión. |
| CI verde actual | `js-gates.json` excluye explícitamente CI remoto. Esta revisión no certifica el CI del HEAD ni una promoción a QA. |

No se modifican los resultados históricos ni el informe previo no versionado del 2026-10-09. Los cambios de producto se limitan al foco visible del selector de archivo. La aceptación con lector de pantalla y la comprobación del CI remoto conservan sus límites.

## Validación de esta revisión

- Dashboard, mensajes de error y accesibilidad: **19 pruebas pasan**, tres archivos, con `--maxWorkers=2`.
- Títulos: **20 pruebas pasan** en repetición aislada con `--maxWorkers=1 --testTimeout=15000`. En la ejecución conjunta pasaron 38/39: el import de Inicio tardó 8.5 s y agotó el límite predeterminado de 5 s. No se cambió la expectativa ni la configuración versionada.
- `npm run lint --workspace frontend-web/app`: pasa. `npm run typecheck --workspace frontend-web/app`: pasa. `git diff --check`: pasa.
- Node 24.21.0. El primer intento de Vitest fue bloqueado por `spawn EPERM` de esbuild dentro del sandbox; se reintentó fuera de él. La primera instalación local de la rama anterior carecía de `@sentry/browser`; `npm ci --prefer-offline` fuera del sandbox sincronizó 981 paquetes con el lockfile de Dev, sin modificarlo. El intento restringido de instalación había fallado con ENOTCACHED.
- No se ha repetido el recorrido con API real ni QA visual en navegador. El anillo del selector de archivo se verificó en código; queda pendiente su inspección visual por teclado. No se certifica accesibilidad completa ni CI remoto.
