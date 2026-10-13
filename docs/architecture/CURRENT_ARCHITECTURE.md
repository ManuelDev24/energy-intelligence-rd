# Arquitectura implementada del piloto

Actualizada: 4 de octubre de 2026. Alcance: cinco viviendas, facturas mensuales, dashboard,
proyección, equipos y alertas. Autenticación pospuesta por decisión explícita; piloto privado.

## Runtime y límites

- Un monorepo npm con web Next.js 15/React 19, móvil Expo 57/React Native y API Python 3.12/FastAPI.
- Un backend y PostgreSQL 16. Redis es opcional y no participa en el flujo del piloto.
- `apps/web/src/app` compone rutas delgadas; las vistas viven en `features`.
- `apps/mobile/src/navigation` compone pantallas agrupadas en `features`.
- `packages/core`: formato, gráficas, sugerencias de formulario y tokens de presentación.
- `packages/api-contracts`: tipos y parsers Zod generados desde los schemas Pydantic, con OpenAPI versionado.
- `packages/api-client`: HTTP compartido, validación runtime, paginación, errores, cancelación y timeout.
- API: routers HTTP, servicios de aplicación por recurso, modelos SQLAlchemy y cálculos puros.
  Mantener esta estructura pequeña; no añadir capas vacías para completar un patrón.

```text
Web / Mobile UI → React Query → cliente compartido → REST /api/v1
→ router → servicio de aplicación → SQLAlchemy → PostgreSQL
                         ↘ cálculos puros Decimal
```

## Datos y transacciones

Las escrituras bloquean primero la vivienda, luego modifican recursos/umbrales. Facturas,
recalculo de alertas y auditoría se confirman juntos. Una exclusión GiST protege períodos
solapados incluso si otro escritor omite el servicio. Fechas de período son inclusivas.

`audit_events` conserva snapshots de mutaciones aunque el recurso se borre. El actor `pilot`
es una etiqueta de contexto, no una identidad autenticada. Los seeds son explícitos y no se
registran como acciones de usuarios. El piloto conserva el borrado físico existente; para
usuarios reales se debe elegir una política de archivo/retención antes de publicar.

El dashboard usa las últimas seis facturas y agregados del historial en una consulta consistente.
La comparación usa la factura anterior, aunque falte un mes calendario. `days` es lo declarado
en la factura; no se infiere obligatoriamente del rango ni de las lecturas del contador.

`REAL` significa valor tomado de una factura introducida, no telemetría de un sensor ni
verificación independiente. `source=seed`/`is_demo` mantienen la procedencia demo.
`ESTIMATED` y `PROJECTED` se conservan en métricas. `INFERRED` es una etiqueta de presentación
para recomendaciones por reglas, no una cuarta calidad del contrato Metric.

## Contratos y estado

`npm run contracts:generate` exporta OpenAPI y parsers/tipos; `npm run contracts:check` detecta drift.
La generación no necesita conexión DB. Validadores cruzados siguen siendo autoritativos en API.
Los decimales canónicos viajan como strings; parsers aceptan números finitos de fixtures anteriores.
Number se utiliza para formato/gráficas, no para persistir cálculos financieros del servidor.

Las listas mantienen arrays compatibles y aceptan `limit` 1–500 y `offset` >=0. El cliente carga
páginas de 100 sin truncar silenciosamente. Cambios concurrentes durante paginación pueden
requerir refresco; los IDs repetidos se rechazan como respuesta inconsistente.

React Query posee los datos del servidor; selección de vivienda/onboarding viven en
Context/Zustand. Formularios mantienen estado local. No copiar facturas a un store global.
La selección local no concede permisos. Al introducir usuarios, cache y credenciales deberán
tener un ciclo de sesión independiente y se limpiarán al cambiar identidad.

## Operación y verificación

- API y PostgreSQL se publican en loopback por defecto. Para un teléfono físico configurar
  `API_BIND_ADDRESS` con la IP de una interfaz LAN privada; no convertir el piloto en API pública.
- Seed y migración automática de arranque son opciones explícitas de desarrollo.
- Staging/production rechazan defaults locales, seed y migración por réplica. Migrar una sola vez
  con `docker compose run --rm migrate`, antes de iniciar réplicas con `MIGRATE_ON_START=false`.
- Pool configurable: conexiones máximas por proceso = tamaño + overflow. Multiplicar por réplicas.
- `/health/live` no consulta DB; `/health` verifica PostgreSQL y actúa como readiness.
- Errores conservan `detail` y añaden `code`/request ID; respuestas inválidas son errores de contrato.
- `scripts/backup_pilot.sh` produce un dump privado fuera de Git. `restore_drill.sh` solo crea una
  base nueva terminada en `_test`, restaura, comprueba y la elimina; nunca reemplaza el piloto.
- CI ejecuta tests API con PostgreSQL obligatorio, contratos, límites de dependencias, tipos,
  lint, build, pruebas de paquetes y recorridos web/móvil contra una API real.
- Maestro es la verificación de interacción nativa. Un recorrido del cliente móvil no equivale
  a una prueba en dispositivo. Exportar bundles verifica compilación, no interacción.

Los cambios se desarrollan en `Dev`; Manuel conserva la promoción a QA/main. El estado local
no demuestra ejecución del CI remoto ni autoriza una publicación pública.

## Crecimiento

Medir antes de añadir cache distribuida, workers, particiones o servicios adicionales.
La consulta de dashboard ya limita objetos materializados; los listados tienen límites y el pool
un presupuesto. El recalculo completo de alertas sigue siendo adecuado para facturas mensuales;
su sustitución por recalculo incremental requiere una carga medida y pruebas de vecinos/borrados.
`scripts/load_pilot.py` es una sonda de lectura local, no una certificación de un millón de usuarios.

Visión futura: OCR, IA, telemetría, solar y almacenamiento externo siguen fuera de este piloto.
