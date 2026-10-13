# Cierre técnico de estabilización del piloto

Fecha: 4 de octubre de 2026. Alcance autorizado: completar la arquitectura del piloto privado.
El usuario eligió posponer autenticación. No se publicó un servicio público ni se promovieron ramas.

## Resultado de la auditoría

| Hallazgo | Estado y evidencia |
|---|---|
| P01 Acceso sin autenticación | Pospuesto explícitamente; API y PostgreSQL limitados a loopback por defecto. Seleccionar vivienda sigue siendo acceso demo. |
| P02 Cache web | Invalidación existente conservada y pruebas de regresión verificadas. |
| P03 Concurrencia | Bloqueo por vivienda, transacción única y exclusión PostgreSQL para períodos inclusivos. Pruebas concurrentes reales y de escritura directa. |
| P04 Precisión de alertas | Numeric(18,2), migración 0004, pruebas de extremos y rechazo de downgrade incompatible. |
| P05 Seguridad de pruebas DB | Validación antes de conectar: DB dedicada `_test`, nombre seguro y distinta de aplicación. CI exige PostgreSQL. |
| P06 Contratos duplicados | Pydantic → OpenAPI y parsers/tipos generados en api-contracts; CI detecta drift. |
| P07 Respuestas sin validar | Cliente compartido con Zod, pertenencia a vivienda, decimales/fechas, errores estructurados, timeout y cancelación. |
| P08 Semántica de comparación | API autoritativa: factura previa, incluso si falta un mes; documentado. |
| P09 Features desconectadas | Vistas activas agrupadas en features; rutas y navegación delgadas; retirados los duplicados anteriores del checkout. |
| P10 Lectura que escribe | GET de umbrales devuelve defaults sin persistir; escritura transaccional explícita. |
| P11 Historial sin límites | Paginación API/cliente; dashboard materializa seis facturas y agrega conteos en un SELECT. Recalculo completo de alertas conservado para el piloto mensual. |
| P12 Arranque/infraestructura | Seed opt-in, migración separada, guardas de entorno, pool configurable y contenedor sin root. |
| P13 Gates incompletos | Tests de reglas en core; workflow incluye recorridos web/móvil contra API real, contratos y límites de arquitectura. |
| P14 Trazabilidad/borrado | Snapshots de mutaciones sobreviven a borrados; actor `pilot` no identifica a una persona. Backup y restauración probados. Política de retención para usuarios reales pendiente de definir antes de publicar. |
| P15 Documentación | README y arquitectura actual actualizados; auditoría y asignaciones anteriores conservadas como históricas. |
| P16 Build/lockfiles | Un lockfile npm, Node 24 y raíz explícita de Next. |

Se extrajeron servicios de hogares, facturas, equipos y alertas sin añadir capas vacías.
Routers traducen HTTP; servicios controlan transacciones; cálculos permanecen independientes de ORM.
Los errores de aplicación no dependen de FastAPI. Las escrituras y su auditoría se confirman juntas.

## Verificaciones ejecutadas

- API: **134 pruebas pasan** en PostgreSQL temporal separado del piloto.
- JavaScript contra API real: `npm run typecheck` pasa en todos los workspaces; ESLint web pasa.
  Vitest: core **27/27**, contratos **2/2**, cliente **4/4**, web **44 pasadas + 5 skipped**,
  móvil **39 pasadas + 8 skipped** (47 pruebas declaradas). Recorrido móvil real **8/8**.
- `npm ci` en la raíz: completó correctamente desde el lockfile del monorepo.
- `npm run build --workspace apps/web`: build de producción Next 15.5.27 pasa.
- Contratos generados (`uv run python -m scripts.generate_contracts --check`), límites de
  arquitectura (`python scripts/check_architecture.py`) y `git diff --check`: pasan.
- Exportación Expo de bundles iOS y Android: pasa. Una exportación no prueba interacción nativa.
- Maestro en iPhone 18 Pro/iOS 27 y emulador EnergyRD_Pixel/Android 16: **75/75 pasos en cada plataforma**,
  ejecutados contra el backend del piloto en revisión 0005. Onboarding → selección → validación negativa →
  alta de factura → dashboard y proyección → alerta y descarte → equipos → limpieza de factura.
  En cada caso PILOT-05 queda restaurada a dos facturas, sin alertas activas.
- Docker: imagen del API ejecuta como uid 10001 (`app`), `/health` sano, `alembic current` muestra `0005 (head)`.
- El compose limita los puertos del host a loopback; Redis es opt-in con perfil `jobs`.

## Estado del piloto activo

Antes de migrar se guardó `.local-backups/before-architecture-completion.dump` (privado, ignorado por Git).
La restauración comprobó cinco viviendas y trece facturas en revisión 0003.
Se aplicaron 0004 y 0005 al piloto; tras reiniciar se verificó revisión **0005**, **5 viviendas**,
**13 facturas** y health sano. Puertos: API 127.0.0.1:8000, PostgreSQL 127.0.0.1:5433.

## Dependencias y límites restantes

Vitest se actualizó a 4.1.11, Vite a 7.3.6 y PostCSS a 8.5.28; se retiraron dependencias móviles
sin uso. `npm ci` reportó 28 avisos (incluye cadenas transitivas; revisar con `npm audit` antes
 de distribuir; no ejecutar `npm audit fix --force` sin revisión).

- [braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm): último npm 3.0.3 sigue en rango afectado;
  llega mediante herramientas de patrones/compilación.
- [node-forge](https://github.com/advisories/GHSA-86w9-cpqp-85rv): último npm 1.4.0 sigue afectado;
  llega mediante herramientas de certificados de Expo.
- [uuid](https://github.com/advisories/GHSA-w5hq-g745-h8pq): versión transitiva de xcode/Expo anterior
  a la corrección; sustituirla requiere verificar compatibilidad del generador nativo.

No se aplicó `npm audit fix --force`: sus propuestas incluyen retroceder Expo a SDK 44 y cambiar
mayores de otros frameworks. Estos avisos no se consideran resueltos ni se interpreta el piloto
privado como eliminación del riesgo. Revisarlos antes de distribuir o publicar.

La autenticación, permisos por vivienda, retención para datos personales, publicación y capacidad
masiva quedan fuera de este cierre privado. OCR, IoT, IA, solar y microservicios siguen siendo visión futura.
No se ejecutó CI remoto, commit, push ni promoción a main; la validación reportada es local.
El checkout conserva trabajo previo del equipo; cerrar asignaciones exige su revisión y evidencia de commit.

Para repetir Maestro local en iOS, iniciar Metro con `NODE_OPTIONS=--dns-result-order=ipv4first`
y `--localhost`; evita que localhost escuche solo en IPv6 mientras el guion abre 127.0.0.1.
La primera tentativa falló por ese entorno; con IPv4 explícito el recorrido terminó correctamente.

Operación y límites completos: [CURRENT_ARCHITECTURE.md](CURRENT_ARCHITECTURE.md).
