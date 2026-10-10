# Energy RD — piloto de inteligencia energética

Monorepo con web, móvil y una API compartida para registrar facturas mensuales,
comparar consumo, proyectar la siguiente factura, declarar equipos y gestionar alertas.
El piloto es privado y no tiene autenticación. La selección de vivienda es una preferencia demo.

## Implementado

- Web: Next.js 15, React 19, TypeScript, Tailwind y React Query.
- Móvil: Expo 57, React Native, TypeScript, React Navigation, React Query y Zustand.
- API: Python 3.12, FastAPI/Pydantic, SQLAlchemy, psycopg y Alembic.
- Datos: PostgreSQL 16; períodos sin solapamientos, escrituras coordinadas por vivienda,
  precisión Decimal y auditoría de mutaciones.
- Paquetes: `core` para presentación, `api-contracts` generado desde Pydantic y
  `api-client` con validación runtime, paginación y cancelación.

No hay telemetría horaria, OCR, IA, integración IoT, solar ni almacenamiento de archivos.
Redis es opcional; no se utiliza en el flujo del piloto.

## Inicio local

Requisitos: Node.js 24, npm, Docker Compose; uv/Python 3.12 para desarrollo y pruebas API fuera de Docker.

```bash
npm ci
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
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
npm run build --workspace apps/web
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
scripts/backup_pilot.sh
scripts/restore_drill.sh .local-backups/<archivo>.dump
```

Para un release con varias réplicas, ejecutar una sola vez `docker compose run --rm migrate`
y arrancar con `MIGRATE_ON_START=false`. El seed demo es opt-in y se rechaza en staging/production.
Los dumps se guardan fuera de Git y el restore drill solo usa una base desechable nueva.

## Documentación

- [Arquitectura implementada](docs/architecture/CURRENT_ARCHITECTURE.md)
- [Auditoría original](docs/architecture/AUDIT_2026-10-04.md)
- [Guía de demo](docs/DEMO_GUIDE.md)
- [Checklist de release](docs/RELEASE_CHECKLIST.md)
- [API y reglas de datos](services/api/README.md)
- [Visión del producto](docs/SPECIFICATION.md)
- [Plan de cierre antes de módulos nuevos](docs/CLOSURE_PLAN_2026-10-10.md)

Las proyecciones son orientación calculada sobre facturas introducidas; no son garantía de consumo o importe futuro.
