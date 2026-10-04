# ⚡ Energy RD — Plataforma Nacional de Inteligencia y Gestión Energética

**Energy RD** es una plataforma de gestión energética para República Dominicana que permite a hogares, familias, comercios, condominios, hoteles y empresas:

- Conocer su consumo eléctrico
- Registrar y analizar sus facturas
- Estimar cuánto pagarán
- Detectar anomalías
- Identificar patrones de consumo
- Recibir recomendaciones de ahorro
- Establecer objetivos de consumo/costo
- Registrar y analizar interrupciones
- Integrar smart meters
- Integrar dispositivos IoT
- Monitorear sistemas solares
- Monitorear baterías e inversores
- Utilizar un asistente de IA especializado en energía
- Construir una plataforma de inteligencia energética agregada para República Dominicana

## 🏗 Arquitectura

```
                    ENERGY RD
                       │
         ┌─────────────┼─────────────┐
         │             │             │
         ▼             ▼             ▼
      MOBILE          WEB          PLATFORM
   iOS/Android     Dashboard     Backend/API
```

### Stack

- **Mobile:** React Native + Expo + TypeScript
- **Web:** Next.js + React + TypeScript + Tailwind CSS + shadcn/ui
- **Backend:** Python + FastAPI + Pydantic + SQLAlchemy + Alembic
- **Database:** PostgreSQL + Neon (MVP) → TimescaleDB + pgvector (futuro)
- **Cache/Jobs:** Redis
- **IA:** LLM API + MCP + Hermes + energy-rd-mcp

## 📁 Estructura del Repositorio

```
energy-rd/
├── apps/
│   ├── mobile/          # React Native + Expo
│   ├── web/            # Next.js dashboard
│   └── admin/          # Next.js admin panel
├── services/
│   ├── api/            # FastAPI backend
│   ├── energy-engine/  # Motor de consumo, forecast, anomalías
│   ├── ai/             # Energy Copilot, LLMs
│   ├── ingestion/      # OCR, smart meters, IoT, external data
│   └── workers/        # Background jobs, processing
├── packages/
│   ├── ui/             # Design System compartido
│   ├── types/          # Types compartidos
│   ├── config/         # Configuración compartida
│   └── validation/     # Zod schemas compartidos
├── mcp/
│   └── energy-rd-mcp/  # MCP Server para Hermes
├── database/
│   ├── migrations/     # Alembic migrations
│   ├── seeds/          # Seed data
│   └── schemas/        # Database schemas
├── infrastructure/     # Docker, infra config
├── docs/               # Documentación
└── docker-compose.yml
```

## 🚀 Primeros Pasos

> **Piloto (5 viviendas):** la forma verificada de levantar el proyecto desde cero y hacer la demo está en
> [`docs/DEMO_GUIDE.md`](docs/DEMO_GUIDE.md). Antes de cada release: [`docs/RELEASE_CHECKLIST.md`](docs/RELEASE_CHECKLIST.md).
> Las instrucciones de abajo describen la visión completa y pueden no aplicar todavía.

### Prerrequisitos

- Node.js 18+
- Python 3.10+
- Docker + Docker Compose
- pnpm (recomendado) o npm

### Instalación

```bash
# Instalar dependencias
pnpm install

# Levantar servicios (PostgreSQL, Redis)
docker compose up -d

# Correr migraciones
cd services/api && alembic upgrade head

# Correr backend
pnpm dev:api

# En otra terminal, correr web
pnpm dev:web

# En otra terminal, correr mobile
pnpm dev:mobile
```

## 🧠 MVP

Los 10 módulos del MVP:

1. Onboarding
2. Dashboard/Home
3. Consumo
4. Facturas
5. Proyección de factura
6. Ahorro
7. Alertas
8. Equipos
9. Energy Copilot
10. Perfil

## 🔄 Core Loop

```
FACTURA → CONSUMO → ANÁLISIS → PROYECCIÓN → ALERTA → AHORRO → NUEVO CONSUMO
```

## 📄 Documentación

- [Especificación General](docs/specification.md)
- [Master Project Context](docs/master-context.md)
- [Data Architecture](docs/data-architecture.md)
- [API Reference](docs/api.md)
- [Database Schema](database/schemas/README.md)

## 🏢 Distribuidoras Soportadas

- EDESUR
- EDENORTE
- EDEESTE

## ⚠️ Nota Legal

Energy RD es una plataforma de inteligencia energética. Las proyecciones, estimaciones y recomendaciones son calculadas por modelos estadísticos y IA, y deben usarse como guía, no como garantía financiera o técnica.

## 📄 Licencia

Ver [LICENSE](LICENSE).
