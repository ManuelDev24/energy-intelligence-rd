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

## Revisión 2026-10-05 — aceptación de riesgo (aprobada por el owner 2026-10-05)
- Auditoría repetida: 21 altos, 0 críticos; todos derivan de **2 paquetes**:
  - `braces@3.0.3` (GHSA-vfj7-8cjw-p6xm, DoS por patrones anidados) ← `tailwindcss@3.4.19` (chokidar/micromatch). Solo compilación web; no se incluye en el bundle ni en la API.
  - `node-forge@1.4.0` (GHSA-86w9-cpqp-85rv, verificación PKCS#1 v1.5) ← `@expo/cli` / `@expo/code-signing-certificates`. Solo herramienta de desarrollo Expo; no se incluye en la app compilada.
- Registro npm (2026-10-05): la última versión publicada de ambos es la vulnerable → **no existe parche**. Las "correcciones" de `npm audit` son downgrades mayores absurdos (expo@44, react-native@0.72, eslint-config-next@14) y se rechazan.
- Mitigación: patrones de glob solo del repo (no de usuarios); Expo CLI sin firma de actualizaciones OTA con certificados externos; CI y desarrollo en entornos confiables.
- Salida definitiva: migración a Tailwind 4 (elimina chokidar/micromatch→braces) como tarea propia; actualizar Expo cuando upstream publique node-forge corregido.
- Revisar en cada actualización de dependencias o en 30 días (2026-11-04).

## Revisión 2026-10-10 — ERD-REL-VERIFY (Manuel)

Auditoría de partida (`npm audit`, commit `4fbdc75`): **23** hallazgos = 21 altos + **2 moderados nuevos**.

### Corregido
- **2 moderados → 0.** `postcss-selector-parser@6.1.4` (GHSA-rj75-hqrm-r3gf, complejidad cuadrática al parsear
  selectores planos) llegaba por `tailwindcss@3.4.19` y `postcss-nested@6.2.0`. Parche publicado en `7.1.6`
  (2026-09-03); la rama `legacy-v6` no tiene corrección. Override acotado en `package.json`
  (`tailwindcss@3.4.19 → postcss-selector-parser 7.1.6`, también para su `postcss-nested`).
  **Prueba de no regresión:** el CSS de producción de la web es idéntico regla a regla antes/después del override
  (única diferencia: las clases nuevas del enlace "Saltar al contenido" de ERD-WEB-QUALITY). Web build OK.
- **Expo al parche recomendado por `expo install --check`:** `expo 57.0.26 → 57.0.27`, `expo-constants
  57.0.20 → 57.0.21` (`@expo/cli 57.0.28`, `@expo/metro-file-map 57.0.4`, que ya no depende de `micromatch`).
  `expo install --check`: *Dependencies are up to date*. Export iOS/Android OK; smoke Maestro re-ejecutado.

### Riesgo residual (20 altos, 0 críticos) — mismos 2 advisories ya aceptados el 2026-10-05
| Advisory | Paquete vulnerable | Llega por | ¿Parche? | Alcance |
|---|---|---|---|---|
| GHSA-vfj7-8cjw-p6xm (DoS) | `braces@3.0.3` (última publicada) | `micromatch` ← `tailwindcss@3`, `fast-glob` (`eslint-config-next`), `metro-file-map` | No | Build/lint/Metro en desarrollo; no llega al bundle web, a la app ni a la API |
| GHSA-86w9-cpqp-85rv (firma PKCS#1) | `node-forge@1.4.0` (última publicada) | `@expo/code-signing-certificates` ← `@expo/cli` | No | Solo Expo CLI (firma de updates OTA, no usada) |

Los otros 18 nombres del informe (`expo`, `react-native`, `metro*`, `@expo/*`, `eslint-config-next`,
`tailwindcss`, `chokidar`, `fast-glob`, `micromatch`…) son **transitivos de esos dos advisories**, no
vulnerabilidades propias. Las "correcciones" de `npm audit` siguen siendo downgrades mayores (expo@44,
react-native@0.72, eslint-config-next@14, tailwind 4) y se rechazan.

- Decisión: **la aceptación de riesgo del 2026-10-05 sigue vigente** para estos 2 advisories, con las mismas
  mitigaciones. **Confirmada por Manuel el 2026-10-10** con el recuento actual (20 altos, 0 críticos).
- Salida definitiva sin cambios: Tailwind 4 (tarea propia) y Expo cuando upstream publique `node-forge` corregido.
- Próxima revisión: 2026-11-04 o en la próxima actualización de dependencias.
