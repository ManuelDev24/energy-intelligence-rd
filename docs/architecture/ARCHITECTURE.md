> Este documento conserva la visión original y las áreas futuras. Para el código implementado y sus límites, consultar [CURRENT_ARCHITECTURE.md](CURRENT_ARCHITECTURE.md).

# ⚡ Energy RD — Arquitectura del Sistema

> Documento de arquitectura completo para la plataforma de inteligencia energética.
> Versión: 1.0 — 2026-09-30

---

## Índice

1. [Visión General](#1-visión-general)
2. [Capas de la Arquitectura](#2-capas-de-la-arquitectura)
3. [Decisión: Modular Monolith](#3-decisión-modular-monolith)
4. [Backend](#4-backend)
5. [Energy Engine](#5-energy-engine)
6. [IA y Energy Copilot](#6-ia-y-energy-copilot)
7. [API](#7-api)
8. [Base de Datos](#8-base-de-datos)
9. [Frontend](#9-frontend)
10. [OCR y Facturas](#10-ocr-y-facturas)
11. [Redis, Workers y Eventos](#11-redis-workers-y-eventos)
12. [MCP y Hermes](#12-mcp-y-hermes)
13. [Stack Tecnológico](#13-stack-tecnológico)
14. [Estructura de Directorios](#14-estructura-de-directorios)
15. [Principios de Desarrollo](#15-principios-de-desarrollo)

---

## 1. Visión General

Energy RD es una **plataforma de inteligencia energética** para República Dominicana. La arquitectura está diseñada para soportar 5 viviendas piloto iniciales, pero sin comprometer la capacidad de escalar a medidores inteligentes, IoT, solar, baterías, negocios y condominios.

La base arquitectónica es:

> **Monorepo + Arquitectura modular + Backend Modular Monolith + PostgreSQL relacional + arquitectura orientada a dominios + frontend por features + API REST + motor energético separado lógamente + IA mediante herramientas controladas.**

---

## 2. Capas de la Arquitectura

El sistema se divide en **6 capas principales**:

```text
┌─────────────────────────────────────┐
│             PRESENTATION            │
│       Mobile / Web / Admin          │
├─────────────────────────────────────┤
│              API LAYER              │
│          REST / FastAPI             │
├─────────────────────────────────────┤
│           APPLICATION               │
│       Use Cases / Services          │
├─────────────────────────────────────┤
│             DOMAIN                  │
│ Energy / Billing / Forecast / AI    │
├─────────────────────────────────────┤
│          INFRASTRUCTURE             │
│ DB / OCR / Weather / IoT / Redis    │
├─────────────────────────────────────┤
│               DATA                  │
│            PostgreSQL               │
└─────────────────────────────────────┘
```

Esta combinación representa:

- **Modular Monolith** — un solo backend con módulos separados internamente
- **Clean Architecture** — separación por capas con dependencias hacia adentro
- **Domain-Driven Design ligero** — módulos organizados por dominio (auth, energy, billing, etc.)
- **Feature-based frontend** — código organizado por funcionalidad, no por tipo de archivo
- **REST API** — comunicación stateless entre frontend y backend
- **Event-driven preparado para crecer** — eventos preparados, sin Kafka inicialmente

No se implementa DDD extremo ni Clean Architecture excesivamente abstracta para evitar código vacío que no aporta valor en un equipo pequeño.

---

## 3. Decisión: Modular Monolith

**No recomiendo comenzar con microservicios.**

Esto complicaría:

- deployment
- debugging
- autenticación
- comunicación entre servicios
- bases de datos
- Docker
- CI/CD
- testing

**En cambio, se usa Modular Monolith:**

```text
                 BACKEND
                    │
       ┌────────────┼────────────┐
       │            │            │
      Auth       Energy        Billing
       │            │            │
       ├────────────┼────────────┤
                    │
                 AI/CoPilot
```

Todo vive en un solo backend, pero cada dominio está separado internamente. Así se puede convertir cualquier módulo en microservicio si realmente se necesita.

---

## 4. Backend

### Tecnologías

| Componente | Tecnología |
|---|---|
| Lenguaje | Python 3.10+ |
| Framework | FastAPI |
| ORM | SQLAlchemy |
| Validación | Pydantic |
| Migraciones | Alembic |
| Base de datos | PostgreSQL |
| Cache/Queue | Redis |
| Workers | Celery/RQ/worker propio |

### Estructura del Backend

```text
services/
└── api/
    └── app/
        │
        ├── main.py
        │
        ├── core/
        │   ├── config.py
        │   ├── database.py
        │   ├── security.py
        │   ├── logging.py
        │   └── dependencies.py
        │
        ├── modules/
        │   │
        │   ├── auth/
        │   │   ├── router.py
        │   │   ├── service.py
        │   │   ├── repository.py
        │   │   ├── models.py
        │   │   ├── schemas.py
        │   │   └── dependencies.py
        │   │
        │   ├── users/
        │   ├── homes/
        │   ├── meters/
        │   ├── devices/
        │   ├── consumption/
        │   ├── bills/
        │   ├── tariffs/
        │   ├── forecasts/
        │   ├── anomalies/
        │   ├── recommendations/
        │   ├── alerts/
        │   ├── interruptions/
        │   ├── solar/
        │   ├── batteries/
        │   └── copilot/
        │
        ├── integrations/
        │   ├── ocr/
        │   ├── weather/
        │   ├── utilities/
        │   ├── storage/
        │   └── iot/
        │
        ├── shared/
        │   ├── schemas/
        │   ├── exceptions/
        │   ├── utils/
        │   └── events/
        │
        └── tests/
```

### Cada módulo tiene responsabilidad propia

Por ejemplo, el módulo de consumo:

```text
consumption/
├── router.py
├── service.py
├── repository.py
├── models.py
├── schemas.py
└── tests/
```

El router recibe la petición HTTP pero **no calcula nada**:

```text
Router
   ↓
Service
   ↓
Repository
   ↓
Database
```

### Separación fundamental

**Evitar esto:**

```text
Router
   ↓
SQL
   ↓
Calculaciones
   ↓
IA
   ↓
Respuesta
```

**Usar esto:**

```text
API
 │
 ▼
Controller / Router
 │
 ▼
Application Service
 │
 ▼
Domain Logic
 │
 ├── Energy Engine
 │
 ▼
Repository
 │
 ▼
PostgreSQL
```

Esto hace que el proyecto sea mucho más fácil de mantener.

---

## 5. Energy Engine

El **Energy Engine** es uno de los componentes más importantes. No debe depender directamente del frontend.

Es responsable de:

```text
Consumption
     │
     ├── kWh
     ├── averages
     ├── peaks
     ├── comparisons
     └── trends

Billing
     │
     ├── estimated cost
     ├── bill analysis
     └── tariff calculation

Forecast
     │
     ├── projected kWh
     └── projected cost

Anomaly
     │
     ├── unusual consumption
     └── unusual patterns

Savings
     │
     ├── recommendations
     └── estimated savings
```

El frontend nunca calcula estos valores directamente. Consume los resultados del Energy Engine vía API.

---

## 6. IA y Energy Copilot

### Principio crítico: La IA NO debe calcular directamente

**No queremos:**

```text
User
 ↓
LLM
 ↓
"Creo que consumiste 400 kWh"
```

**Queremos:**

```text
User
 ↓
Energy Copilot
 ↓
Tool
 ↓
Energy Engine
 ↓
PostgreSQL
 ↓
Resultado real
 ↓
LLM
 ↓
Explicación
```

### Ejemplo de flujo

Usuario pregunta: *"¿Por qué pagué más este mes?"*

```text
get_bill()
        ↓
get_consumption_history()
        ↓
get_tariff()
        ↓
get_device_profile()
        ↓
calculate_bill_difference()
        ↓
LLM
        ↓
Explicación
```

La IA **interpreta datos**, no inventa datos.

---

## 7. API

### Endpoints

```text
/api/v1
```

Y los recursos:

```text
/auth
/users
/homes
/meters
/devices
/consumption
/bills
/tariffs
/forecasts
/anomalies
/recommendations
/alerts
/interruptions
/solar
/batteries
/copilot
/dashboard
```

### Ejemplo: Dashboard

```http
GET /api/v1/dashboard
```

Respuesta:

```json
{
  "consumption": {
    "current_month_kwh": 356.4,
    "previous_month_kwh": 331.8,
    "variation_percent": 7.4
  },
  "billing": {
    "current_estimated_cost": 4250,
    "previous_cost": 3980
  },
  "forecast": {
    "projected_kwh": 389,
    "projected_cost": 4620
  },
  "alerts": [],
  "recommendations": []
}
```

El frontend no tiene que hacer esos cálculos — los obtiene de la API.

---

## 8. Base de Datos

### PostgreSQL

PostgreSQL es la base principal. No se separa una base por microservicio.

### Tablas principales

#### Identity
```text
users
profiles
organizations
roles
permissions
```

#### Energy
```text
homes
meters
meter_readings
devices
device_readings
consumption_readings
```

#### Billing
```text
bills
bill_items
bill_readings
tariffs
tariff_versions
tariff_components
```

#### Intelligence
```text
forecasts
anomalies
recommendations
energy_scores
alerts
```

#### Service
```text
interruptions
service_events
```

#### Renewable Energy
```text
solar_systems
solar_readings
batteries
battery_readings
inverters
inverter_readings
```

#### AI
```text
conversations
messages
tool_calls
```

### Modelo conceptual

```text
USER
 │
 ▼
PROFILE
 │
 ▼
HOME
 │
 ├───────────────┐
 ▼               ▼
METER          DEVICES
 │               │
 ▼               ▼
CONSUMPTION   DEVICE_READINGS
 │
 ├───────────────┐
 ▼               ▼
BILLS         FORECASTS
 │
 ▼
BILL_ANALYSIS

HOME
 │
 ├── ALERTS
 ├── ANOMALIES
 ├── RECOMMENDATIONS
 ├── INTERRUPTIONS
 ├── SOLAR_SYSTEM
 └── BATTERY
```

### Datos estructurados

**Incorrecto:**

```text
consumption = "350 kWh"
```

**Correcto:**

```text
value = 350
unit = "kWh"
timestamp = ...
source = ...
status = REAL
```

### Metadata de cada dato energético

```text
value
unit
timestamp
source
status
quality
method
```

Ejemplo:

```json
{
  "value": 352.7,
  "unit": "kWh",
  "timestamp": "2026-09-29T20:00:00",
  "source": "meter",
  "status": "REAL",
  "quality": "VALID"
}
```

### Estados de los datos

```text
REAL        — Dato obtenido directamente de un medidor/factura
ESTIMATED   — Estimación basada en datos disponibles
PROJECTED   — Proyección hacia el futuro
INFERRED    — Inferencia basada en patrones
```

Esto es especialmente importante para la IA.

### PostgreSQL y escalabilidad

Para el MVP, PostgreSQL puro es suficiente. Cuando se tengan:

- mediciones cada segundo/minuto
- miles de dispositivos
- smart meters
- IoT masivo

Se puede introducir **TimescaleDB** sobre PostgreSQL sin cambiar la arquitectura.

---

## 9. Frontend

### Estructura

```text
apps/
├── mobile/
├── web/
└── admin/
```

### Mobile

**Tecnologías:**

| Componente | Tecnología |
|---|---|
| Framework | React Native |
| Plataforma | Expo |
| Routing | Expo Router |
| Lenguaje | TypeScript |
| UI | NativeWind (Tailwind para RN) |
| Server state | TanStack Query |
| Client state | Zustand |
| Forms | React Hook Form |
| Validation | Zod |

**Arquitectura interna del Mobile:**

```text
apps/mobile/

src/
├── app/
│   ├── _layout.tsx
│   ├── index.tsx
│   │
│   ├── onboarding/
│   ├── dashboard/
│   ├── consumption/
│   ├── bills/
│   ├── devices/
│   ├── savings/
│   ├── alerts/
│   ├── copilot/
│   └── profile/
│
├── components/
│
├── features/
│   ├── onboarding/
│   ├── dashboard/
│   ├── consumption/
│   ├── bills/
│   ├── devices/
│   ├── savings/
│   ├── alerts/
│   └── copilot/
│
├── services/
│   ├── api/
│   ├── auth/
│   └── storage/
│
├── hooks/
│
├── stores/
│
├── types/
│
├── validation/
│
└── utils/
```

**Separación de estado:**

- **TanStack Query** maneja: consumo, facturas, alertas, recomendaciones, forecast, dispositivos
- **Zustand** maneja: theme, selected home, UI preferences, temporary state, filters

### Web

**Tecnologías:**

| Componente | Tecnología |
|---|---|
| Framework | Next.js |
| UI | React + TypeScript |
| Styling | Tailwind CSS |
| Components | shadcn/ui + componentes propios |
| Server state | TanStack Query |
| Validation | Zod |

**Enfoque:**

La web está orientada a:
- Administración
- Analítica
- Operaciones
- Gestión de usuarios
- Gestión energética
- Reportes

### Admin

Se puede integrar dentro de `apps/web` inicialmente con rutas `/user` y `/admin`, y separarse posteriormente si es necesario.

### Flujo completo de una petición

**Ejemplo: Consumo de septiembre**

**Frontend:**

```text
ConsumptionScreen
        ↓
useConsumption()
        ↓
TanStack Query
        ↓
GET /api/v1/consumption/monthly
```

**Backend:**

```text
FastAPI
   ↓
Consumption Router
   ↓
Consumption Service
   ↓
Consumption Repository
   ↓
PostgreSQL
```

**Resultado:**

```text
PostgreSQL
   ↓
Repository
   ↓
Service
   ↓
Router
   ↓
JSON
   ↓
TanStack Query
   ↓
Consumption Chart
```

---

## 10. OCR y Facturas

### Flujo del OCR

```text
Usuario
   │
   ▼
Sube factura
   │
   ▼
Mobile
   │
   ▼
API
   │
   ▼
Storage
   │
   ▼
OCR
   │
   ▼
Extraction
   │
   ▼
Validation
   │
   ▼
Usuario confirma
   │
   ▼
Database
```

**Nunca:** `OCR → DB` directamente.

Debe existir siempre: `OCR → Extraction → Validation → Human confirmation → Database`

---

## 11. Redis, Workers y Eventos

### Workers

No todo debe ejecutarse durante la petición HTTP. Las tareas pesadas van a workers:

```text
OCR
Forecast
Anomaly detection
Emails
Notifications
Heavy calculations
```

**Arquitectura:**

```text
FastAPI
   │
   ▼
Redis / Queue
   │
   ▼
Worker
   │
   ▼
Task
   │
   ▼
PostgreSQL
```

Para el MVP se puede mantener esto sencillo y usar workers solo donde realmente hace falta.

### Eventos (preparados, sin Kafka)

```text
ConsumptionRecorded
BillUploaded
BillValidated
AnomalyDetected
ForecastUpdated
OutageDetected
RecommendationCreated
```

Para el proyecto actual, **PostgreSQL + Redis + Workers** es suficiente. No necesitan Kafka.

---

## 12. MCP y Hermes

### Energy RD MCP Server

Se crea un MCP Server para exponer herramientas seguras a la IA:

```text
mcp/
└── energy-rd-mcp/
```

**Herramientas disponibles:**

```text
get_user_profile
get_home
get_consumption
get_consumption_history
get_bill
get_bill_history
get_tariff
calculate_bill
calculate_forecast
detect_anomalies
get_devices
calculate_device_consumption
calculate_savings
get_interruptions
get_solar_profile
calculate_solar_scenario
```

La IA **no tiene acceso libre a la DB**. Debe pasar por estas herramientas controladas.

### Arquitectura completa de IA

```text
             LLM
              │
              ▼
       ENERGY COPILOT
              │
              ▼
       TOOL REGISTRY
              │
              ▼
         ENERGY MCP
              │
       ┌──────┼──────┐
       ▼      ▼      ▼
    Energy  Billing Forecast
    Engine   Engine   Engine
       │      │      │
       └──────┼──────┘
              ▼
          PostgreSQL
```

---

## 13. Stack Tecnológico

| Área | Tecnología |
|---|---|
| Mobile | React Native |
| Mobile framework | Expo |
| Mobile routing | Expo Router |
| Web | Next.js |
| Frontend | React + TypeScript |
| UI mobile | NativeWind |
| UI web | Tailwind + shadcn/ui |
| Server state | TanStack Query |
| Client state | Zustand |
| Forms | React Hook Form |
| Validation | Zod |
| Backend | Python |
| API | FastAPI |
| ORM | SQLAlchemy |
| Validation backend | Pydantic |
| Migrations | Alembic |
| Database | PostgreSQL |
| Cache/Queue | Redis |
| Workers | Celery/RQ/worker propio |
| Energy calculations | Python |
| IA | LLM + Energy Copilot |
| IA tools | MCP |
| OCR | Servicio OCR desacoplado |
| IoT futuro | MQTT |
| Time series futuro | TimescaleDB |
| Vector search futuro | pgvector |
| Container | Docker |
| CI/CD | GitHub Actions |
| Repository | GitHub |
| Architecture | Modular Monolith |
| Data architecture | Relational + time-series ready |
| Frontend architecture | Feature-based |
| Backend architecture | Domain modules |

---

## 14. Estructura de Directorios

```text
energy-rd/
│
├── apps/
│   ├── mobile/
│   ├── web/
│   └── admin/
│
├── services/
│   ├── api/
│   ├── energy-engine/
│   ├── ai/
│   ├── ingestion/
│   └── workers/
│
├── packages/
│   ├── ui/
│   ├── types/
│   ├── config/
│   └── validation/
│
├── mcp/
│   └── energy-rd-mcp/
│
├── database/
│   ├── migrations/
│   ├── seeds/
│   └── schemas/
│
├── infrastructure/
│   ├── docker/
│   ├── nginx/
│   └── deployment/
│
├── docs/
│   ├── architecture/
│   ├── api/
│   ├── database/
│   └── project/
│
├── tests/
│
├── docker-compose.yml
├── package.json
├── README.md
└── .env.example
```

---

## 15. Principios de Desarrollo

### Principio fundamental

No construir "una app móvil con una base de datos". Construir una **pequeña plataforma energética** desde el inicio:

```text
                  ENERGY RD
                     │
       ┌─────────────┼─────────────┐
       │             │             │
     MOBILE         WEB          ADMIN
       │             │             │
       └─────────────┼─────────────┘
                     │
                  API CORE
                     │
       ┌─────────────┼─────────────┐
       │             │             │
    ENERGY        BILLING        USERS
    ENGINE        ENGINE         ENGINE
       │             │             │
       └─────────────┼─────────────┘
                     │
               INTELLIGENCE
                     │
             ┌───────┴───────┐
             │               │
          FORECAST        ANOMALIES
             │               │
             └───────┬───────┘
                     │
                ENERGY AI
                     │
                  COPILOT
                     │
                   MCP
                     │
                PostgreSQL
```

### Orden de desarrollo

**Base de datos → Backend → API → Frontend → Tests → IA → Integraciones**

No al revés.

### Para el MVP de 5 hogares

**PostgreSQL + FastAPI + React Native/Expo + Next.js + TanStack Query + Energy Engine + Copilot** es más que suficiente.

Después se pueden agregar:
- IoT
- TimescaleDB
- MQTT
- Solar
- Baterías
- Medidores inteligentes

Sin destruir la arquitectura inicial.
