# Energy RD — piloto de inteligencia energética

Monorepo con web, móvil y una API compartida para registrar facturas mensuales,
comparar consumo, proyectar la siguiente factura, declarar equipos y gestionar alertas.
Las cuentas usan correo y contraseña (sesiones con refresh rotatorio, verificación de correo, recuperación,
invitaciones a viviendas) y la base aísla los datos por vivienda con RLS. El modo piloto sin autenticación
(`AUTH_ENABLED=false`) solo existe en desarrollo y debe pedirse de forma explícita; en staging/producción la API no arranca sin autenticación.

## Implementado

- Web: Next.js 15, React 19, TypeScript, Tailwind y React Query.
- Móvil: Expo 57, React Native, TypeScript, React Navigation, React Query y Zustand.
- API: Python 3.12, FastAPI/Pydantic, SQLAlchemy, psycopg y Alembic.
- Datos: PostgreSQL 16; períodos sin solapamientos, escrituras coordinadas por vivienda,
  precisión Decimal, auditoría de mutaciones con retención, y RLS (roles `erd_app`/`erd_worker`,
  ver [docs/ops/DB_ROLES.md](docs/ops/DB_ROLES.md)).
- OCR de facturas asíncrono (worker + cola de trabajos, archivos cifrados), lecturas, metas, alertas,
  anomalías, notificaciones y exportación/borrado de datos personales.
- Paquetes: `core` para presentación, `api-contracts` generado desde Pydantic y
  `api-client` con validación runtime, paginación y cancelación.

No hay telemetría horaria, IA, integración IoT ni solar. Redis es opcional; no se utiliza en el flujo del piloto.

## Estructura del repositorio

```text
backend/
  api/            # API FastAPI, worker, migraciones Alembic y pruebas (única API de negocio)
frontend-web/
  app/            # Web de usuarios (Next.js) y su BFF de sesión
  admin/          # Consola administrativa (Next.js) y su BFF de sesión
frontend-mobile/
  app/            # App móvil (Expo / React Native)
packages/         # Código compartido por web y móvil: core, api-client, api-contracts (generado desde backend)
docs/ scripts/ infrastructure/   # Documentación, utilidades de CI/operación y despliegue
```

Los workspaces npm son `frontend-web/*`, `frontend-mobile/*`, `backend/*` y `packages/*`; se usan por ruta
(`npm run dev --workspace frontend-web/app`). Los textos de evidencia en `docs/qa/evidence/` conservan las rutas
anteriores (`apps/*`, `services/api`) porque registran comandos tal como se ejecutaron.

## Inicio local

Requisitos: Node.js 24, npm, Docker Compose; uv/Python 3.12 para desarrollo y pruebas API fuera de Docker.

```bash
npm ci
cp .env.example .env
cp frontend-web/app/.env.example frontend-web/app/.env.local
SEED_PILOT=true docker compose up -d --build --wait postgres api
npm run dev:web
```

La API se publica en `http://127.0.0.1:8000` y PostgreSQL en loopback, puerto 5433.
En otra terminal: `npm run dev:mobile`. Para teléfono físico configurar la API en una interfaz
LAN privada y `EXPO_PUBLIC_API_URL`; ver la guía de demo.

## Verificaciones

```bash
npm run typecheck
npm run lint
npm test
npm run build --workspace frontend-web/app
npm run contracts:check
python3 scripts/check_architecture.py
npm run test:api
```

Las pruebas locales contra API real requieren `LIVE_API_URL` (web) y `MOBILE_E2E_API_URL`
(móvil); el CI las configura. PostgreSQL es obligatorio en CI. El test de cliente móvil
no sustituye la interacción nativa con Maestro.

## Migraciones y backups

```bash
npm run db:migrate
scripts/backup_pilot.sh        # SOLO el Postgres local de docker-compose (piloto en desarrollo), sin cifrar
scripts/restore_drill.sh .local-backups/<archivo>.dump
```

Staging/producción (Neon): respaldo **cifrado** con `scripts/db_backup.sh` y restauración verificada con
`scripts/db_restore_verify.sh`; ver [docs/ops/DISASTER_RECOVERY.md](docs/ops/DISASTER_RECOVERY.md).

Para un release con varias réplicas, ejecutar una sola vez `docker compose run --rm migrate`
y arrancar con `MIGRATE_ON_START=false`. El seed demo es opt-in y se rechaza en staging/production.
Los dumps se guardan fuera de Git y el restore drill solo usa una base desechable nueva.

## Documentación

- [Arquitectura implementada](docs/architecture/CURRENT_ARCHITECTURE.md)
- [Auditoría original](docs/architecture/AUDIT_2026-10-04.md)
- [Tamaños y densidad de controles](docs/architecture/UI_DENSITY.md)
- [Mapa de dependencias](docs/architecture/DEPENDENCY_MAP.md)
- [Informe de cierre de UI y QA](docs/audit/CIERRE-UI-QA-2026-10-13.md)
- [Guía de demo](docs/DEMO_GUIDE.md)
- [Checklist de release](docs/RELEASE_CHECKLIST.md)
- [API y reglas de datos](backend/api/README.md)
- [Visión del producto](docs/SPECIFICATION.md)
- [Plan de cierre antes de módulos nuevos](docs/CLOSURE_PLAN_2026-10-10.md)
- [Roles de base de datos y RLS](docs/ops/DB_ROLES.md)
- [Política de retención de datos](docs/security/DATA_RETENTION.md)
- [Política de seguridad](SECURITY.md)
- [Auditoría y estado de la remediación](docs/audit/REMEDIACION-ESTADO.md)

Las proyecciones son orientación calculada sobre facturas introducidas; no son garantía de consumo o importe futuro.
