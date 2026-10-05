# ⚡ ENERGY RD — ESPECIFICACIÓN GENERAL

## 1. Qué será la aplicación

**Energy RD** será una plataforma de inteligencia energética para República Dominicana que permite a hogares, individuos, familias, negocios, condominios, hoteles y empresas:

* registrar su servicio eléctrico
* importar o escanear facturas
* conocer su consumo (hoy, ayer, mes, año)
* conocer cuánto está pagando
* proyectar su próxima factura
* detectar aumentos anormales
* identificar posibles fuentes de consumo
* recibir recomendaciones de ahorro
* registrar interrupciones
* analizar la calidad de su servicio
* integrar medidores inteligentes
* integrar dispositivos IoT
* monitorear sistemas solares
* analizar baterías
* conversar con un asistente de IA energética (Energy Copilot)
* establecer objetivos de ahorro
* comparar su evolución con el tiempo
* y eventualmente formar parte de una plataforma nacional de inteligencia energética

---

## 2. Arquitectura General del Producto

La aplicación tiene tres productos conectados:

```text
                    ENERGY RD
                       │
         ┌─────────────┼─────────────┐
         │             │             │
         ▼             ▼             ▼
      MOBILE          WEB          PLATFORM
   iOS/Android     Dashboard     Backend/API
```

### Mobile
Para consumidores individuales. Acceso rápido a consumo, facturas, alertas, recomendaciones y Energy Copilot.

### Web
Para usuarios avanzados, negocios, administradores, técnicos, empresas y operaciones. Dashboards detallados, reportes, gestión de múltiples viviendas, análisis avanzado.

### Platform
Backend, datos, IA, IoT y analytics. Motor energético, cálculos de facturación, forecasting, detección de anomalías, Energy Copilot.

---

## 3. Navegación Principal Mobile

Navegación inferior tipo tab bar con 4 tabs:

```text
┌───────────────────────────────────┐
│                                   │
│          CONTENIDO                │
│                                   │
│                                   │
├────────┬────────┬────────┬────────┤
│ Inicio │Consumo │ Factura│ Energía│
│        │        │        │        │
├────────┴────────┴────────┴────────┤
│              Perfil               │
└───────────────────────────────────┘
```

Los módulos secundarios están dentro de Inicio, Energía y Perfil. No se muestran 15 módulos en el menú inferior.

---

## 4. MÓDULO 01 — ONBOARDING

Primera experiencia del usuario. Se completa en 6 pantallas.

### Pantalla 1 — Bienvenido a Energy RD

```
⚡
Conoce.
Controla.
Ahorra.

Tu energía bajo control.
```

Botón: **Comenzar**

### Pantalla 2 — Ubicación

```
¿Dónde está tu vivienda?

Provincia: [input]
Municipio: [input]
Sector: [input]
```

Botón: **Continuar**

### Pantalla 3 — Distribuidora

```
Selecciona tu distribuidora

○ EDESUR
○ EDENORTE
○ EDEESTE
○ Otra
```

Botón: **Continuar**

### Pantalla 4 — Tipo de Usuario

```
¿Para qué utilizarás Energy RD?

🏠 Hogar
🏢 Negocio
🏘️ Condominio
🏨 Hotel
🏭 Empresa
```

### Pantalla 5 — Perfil Energético

```
¿Cuántas personas viven aquí?
[ 4 ]

Aires acondicionados
[ 3 ]

Calentador
[Sí]

Piscina
[No]

Paneles solares
[No]

Inversor/batería
[Sí]
```

### Pantalla 6 — Objetivos

```
¿Qué quieres conseguir?

☑ Reducir mi factura
☑ Conocer mi consumo
☑ Detectar problemas
☐ Controlar dispositivos
☐ Solar
```

Botón: **Finalizar**

---

## 5. MÓDULO 02 — HOME / DASHBOARD

Este es el módulo más importante. Debe responder en 5 segundos: "¿Cuánto estoy consumiendo y cuánto estoy gastando?"

### Dashboard

```
Buenos días 👋

Tu energía
────────────────

CONSUMO
437 kWh
Este mes

▲ 8.4%
vs. mes anterior

────────────────

FACTURA ESTIMADA
RD$ 6,842

Proyección:
RD$ 7,130

────────────────

META
RD$ 6,000

██████████████░░

────────────────

⚠️ ALERTA
Tu consumo nocturno aumentó
18% esta semana.

────────────────

💡 OPORTUNIDAD
Podrías ahorrar
≈ RD$ 740/mes

[Ver recomendaciones]
```

### Botones del Dashboard

- **Ver consumo** → módulo Consumo
- **Ver factura** → módulo Facturación
- **Ver recomendaciones** → módulo Ahorro
- **Agregar factura** → flujo OCR
- **Conectar medidor** → Smart Meter
- **Reportar interrupción** → Incidencias

---

## 6. MÓDULO 03 — CONSUMO

Módulo analítico de consumo.

### Dashboard de Consumo

**Filtros:**
- Hoy
- Semana
- Mes
- Año
- Personalizado

**Gráfica:**
Bar chart o line chart mostrando el consumo en el periodo seleccionado.

**Métricas:**
- kWh consumidos
- kW promedio
- Pico máximo
- Promedio diario
- Promedio semanal
- Costo estimado
- Variación respecto al periodo anterior

### Botones

- **Hoy** / **Semana** / **Mes** / **Año** — filtrar visualización
- **Comparar** — comparar periodo actual vs anterior (ej: Este mes vs Mes anterior)

---

## 7. MÓDULO 04 — CONSUMO POR HORA

Para usuarios con datos de mayor frecuencia.

Muestra lista de consumo por hora del día:

```
00:00  1.2 kWh
01:00  1.1 kWh
...
18:00  4.8 kWh
19:00  5.2 kWh
20:00  5.8 kWh
```

La app identifica:
- **Horas de mayor consumo:** ej: 6 PM – 10 PM
- **Horas de menor consumo:** ej: 2 AM – 6 AM

---

## 8. MÓDULO 05 — FACTURAS

Módulo de gestión de facturas eléctricas.

### Estructura

```
Facturas
├── Registrar
├── Escanear
├── Historial
└── Analizar
```

### Agregar Factura

Botón: **+ Agregar factura**

Opciones:
- 📷 Tomar foto (OCR)
- 🖼️ Seleccionar imagen (OCR)
- ✍️ Introducir manualmente

### OCR de Factura

Flujo completo:

```
Foto
↓
OCR
↓
Extracción
↓
Validación
↓
Usuario confirma
↓
Base de datos
```

**Datos detectados:**
- Distribuidora
- Número de contrato
- Periodo
- Lectura anterior
- Lectura actual
- Consumo (kWh)
- Importe
- Cargos
- Fecha

### Pantalla de Confirmación OCR

```
Hemos encontrado:

Consumo
437 kWh

Total
RD$ 6,842

Periodo
Agosto 2026

¿Está correcto?

[Confirmar]  [Editar]
```

---

## 9. MÓDULO 06 — ANÁLISIS DE FACTURA

Inteligncia sobre las facturas registradas.

**Ejemplo:**
> Tu consumo aumentó 14% respecto al periodo anterior.

**Desglose:**
```
Consumo       +14%
Costo         +18%
Días          +2%
```

La app explica posibles causas basándose en los datos disponibles, **distinguiendo claramente entre datos comprobados, estimaciones y posibles causas**. Nunca presenta una hipótesis como certeza.

---

## 10. MÓDULO 07 — PROYECCIÓN DE FACTURA

Uno de los módulos principales.

### Proyección

```
Consumo actual
437 kWh

Días transcurridos
23

Días restantes
7

Consumo proyectado
510 kWh

Factura estimada
RD$ 7,310
```

### Botón

**¿Cómo bajar esta factura?** → Motor de recomendaciones (módulo Ahorro)

---

## 11. MÓDULO 08 — AHORRO

Convierte datos en acciones concretas.

### Dashboard de Ahorro

```
💰 Ahorro

Tu potencial estimado
RD$ 920 / mes
```

### Recomendaciones

Cada recomendación incluye:
- Título (ej: "Aire acondicionado")
- Descripción / acción sugerida
- Impacto visual (barra de progreso)
- Ahorro estimado (RD$)
- Dificultad (Baja, Media, Alta)

**Ejemplos:**

**❄️ Aire acondicionado**
> Reducir 1 hora diaria podría disminuir el consumo estimado.
- Impacto: ████████░░
- Ahorro estimado: RD$ XXX
- Dificultad: Baja

**🔥 Calentador**
> Ajustar horarios podría reducir consumo.
- Impacto: ██████░░░░
- Ahorro estimado: RD$ XXX
- Dificultad: Media

**🌙 Consumo nocturno**
> Detectamos consumo durante horas de baja actividad.
- Impacto: ████░░░░░░
- Ahorro estimado: RD$ XXX
- Dificultad: Baja

Botón: **Aplicar objetivo**

---

## 12. MÓDULO 09 — ENERGY SCORE

Puntuación interna de eficiencia energética. No es un juicio sobre el usuario, es un indicador de producto configurable.

```
       82
   ENERGY SCORE
```

**Componentes:**
- Consumo: 81
- Eficiencia: 86
- Hábitos: 79
- Consistencia: 84

---

## 13. MÓDULO 10 — ALERTAS

Centro de notificaciones del usuario.

### Tipos de alertas

- 🔴 **Crítica:** Consumo extremadamente anormal
- 🟠 **Advertencia:** Aumento considerable
- 🟡 **Información:** Cambio de patrón
- 🟢 **Ahorro:** Oportunidad detectada

### Estructura de cada alerta

- Título
- Descripción
- Severidad
- Fecha
- Origen
- Estado (unread, read, resolved, dismissed)
- Acción relacionada

**Ejemplo:**
> ⚠️ Tu consumo de las últimas 24 horas es 31% superior a tu promedio reciente.

---

## 14. MÓDULO 11 — ANOMALÍAS

Motor automático de detección de patrones inusuales.

**Detecta:**
- Consumo inesperado
- Picos
- Consumo nocturno
- Incrementos repentinos
- Caídas bruscas
- Patrones nuevos

**Ejemplo:**
```
Promedio:  12 kWh/día
Hoy:       27 kWh

⚠️ Anomalía detectada
```

Botón: **Investigar**

---

## 15. MÓDULO 12 — EQUIPOS

El usuario registra sus dispositivos eléctricos.

### Mis Equipos

```
❄️ AC Sala
❄️ AC Habitación
🧊 Nevera
🔥 Calentador
💧 Bomba
🍳 Cocina
📺 TV
```

### Datos de cada equipo

- Nombre
- Marca
- Modelo
- Potencia (W)
- Horas/día estimadas
- Habitación
- Estado (encendido/apagado)

---

## 16. MÓDULO 13 — CONSUMO POR EQUIPO

Inicialmente es estimado. Posteriormente se puede usar IoT/NILM.

```
Consumo estimado

❄️ AC       41%
🧊 Nevera   17%
💧 Bomba    11%
🔥 Boiler    9%
🍳 Cocina    8%
Otros       14%
```

**Nunca presentar estimaciones como mediciones directas.**

---

## 17. MÓDULO 14 — INTERRUPCIONES

El usuario puede registrar interrupciones del servicio eléctrico.

### Reportar Interrupción

```
⚡ Se fue la luz

Inicio:  8:42 PM
Fin:     10:17 PM
Duración: 1h 35m
```

Botón: **Reportar interrupción**

### Historial del Servicio

```
Septiembre
7 interrupciones
8h 42m
Promedio: 1h 14m
```

Gráfica de interrupciones por mes.

---

## 18. MÓDULO 15 — HISTORIAL DEL SERVICIO

Consolidado de interrupciones por mes. Permite ver tendencias de calidad del servicio.

---

## 19. MÓDULO 16 — MAPA ENERGÉTICO

Mapa de República Dominicana con capas de información energética agregada y pública.

**Capas:**
- ⚡ Interrupciones
- 📊 Consumo
- ☀️ Solar
- 🏭 Generación
- 📡 Medidores

La información pública y agregada puede alimentar esta sección (datos ONE, MEM, SIE).

---

## 20. MÓDULO 17 — SMART METER

Para segunda fase. Cuando el usuario tiene un medidor inteligente conectado.

### Dashboard Smart Meter

```
Medidor: 🟢 Conectado

Consumo ahora: 2.84 kW
Voltaje: 121 V
Corriente: 23.4 A
```

### Botones

- Actualizar
- Ver histórico
- Configurar alertas
- Desconectar

---

## 21. MÓDULO 18 — IoT

Segunda/tercera fase. Integración con dispositivos inteligentes.

**Dispositivos soportados:**
- Smart Plugs
- Sensores
- Gateways
- Medidores
- Dispositivos compatibles

### Arquitectura IoT

```
Device
↓
MQTT
↓
IoT Gateway
↓
Backend
↓
Energy Engine
↓
Database
↓
App
```

---

## 22. MÓDULO 19 — SOLAR

Dashboard de sistema solar.

```
☀️ Sistema Solar

Producción hoy:  27.4 kWh
Consumo:         22.1 kWh
Red:             4.2 kWh
Batería:         78%
```

---

## 23. MÓDULO 20 — BATERÍA

```
🔋 Batería

78%

10.4 kWh disponibles
Autonomía estimada: 7h 20m
```

---

## 24. MÓDULO 21 — CALCULADORA SOLAR

Calculadora para determinar si conviene instalar paneles solares.

### Entrada

- Factura promedio
- Consumo
- Ubicación
- Techo disponible (Sí/No)
- Presupuesto

### Salida (simulación, no garantía)

- Sistema recomendado (kWp)
- Producción estimada (kWh/año)
- Ahorro estimado (RD$)
- Periodo estimado de recuperación (años)

---

## 25. MÓDULO 22 — ENERGY COPILOT 🤖

Asistente de IA especializado en energía. Uno de los elementos diferenciales del producto.

### Preguntas rápidas

- ¿Por qué gasté más?
- ¿Cómo ahorro?
- ¿Qué consume más?
- ¿Cuánto pagaré?
- Analiza mi factura
- ¿Me conviene solar?
- ¿Qué pasó esta semana?

### Cómo funciona el Copilot

El Copilot NO tiene acceso directo a la base de datos. Usa herramientas controladas (MCP):

```
User
↓
Energy Copilot
↓
Tool Router
↓
get_bill()
get_consumption_history()
get_tariff()
get_device_profile()
calculate_bill_difference()
↓
Resultado real de la DB
↓
LLM
↓
Explicación en lenguaje natural
```

El Copilot **interpreta datos, no inventa datos**.

### Acciones rápidas

- ¿Por qué gasté más?
- ¿Cómo ahorro?
- ¿Qué consume más?
- ¿Cuánto pagaré?
- ¿Me conviene solar?
- Analiza mi factura

---

## 26. MÓDULO 23 — OBJETIVOS

Establecimiento de metas de ahorro.

```
🎯 Mi objetivo

Máximo mensual: RD$ 6,000

Actual:    RD$ 5,430
Proyección: RD$ 6,740
```

El sistema genera acciones para intentar alcanzar el objetivo.

---

## 27. MÓDULO 24 — GAMIFICACIÓN

Opcional para MVP, importante para futuro.

```
🔥 12 días
⚡ 8% ahorro
🏆 Nivel 4
```

**Retos:**
- Reducir 5%
- Mantener objetivo
- Reducir consumo nocturno
- Mejorar eficiencia

---

## 28. MÓDULO 25 — PERFIL

```
Mi cuenta

👤 Perfil
🏠 Mi vivienda
⚡ Mi servicio
📱 Mis dispositivos
🔔 Notificaciones
🔐 Seguridad
💳 Suscripción
📄 Documentos
```

---

## 29. MÓDULO 26 — MI VIVIENDA

Datos de la vivienda que alimentan los modelos de la plataforma.

```
Tipo:        Apartamento
Habitantes:  4
Habitaciones: 3
A/C:         3
Calentador:  1
Piscina:     No
Solar:       No
```

---

## 30. MÓDULO 27 — CONFIGURACIÓN

```
General
Notificaciones
Privacidad
Seguridad
Unidades
Moneda
Idioma
Integraciones
Dispositivos
```

---

## 31. MÓDULO 28 — CENTRO DE AYUDA

```
¿Cómo funciona?
Facturación
Consumo
Smart Meter
Solar
IoT
Preguntas frecuentes
Contactar soporte
```

---

## 32. MÓDULO 29 — RECLAMACIONES

No es una acusación automática contra distribuidoras. Permite registrar discrepancias y seguir casos.

```
Mi caso

Factura:         RD$ X
Consumo:         X kWh
Historial:       ...
Diferencia detectada: ...
Documentos:      ✓ Factura, ✓ Lecturas, ✓ Fotos
```

Permite registrar número de reclamación, seguimiento, documentos adjuntos.

---

## 33. MÓDULO 30 — BUSINESS

Dashboard para empresas, diferente al módulo hogar.

```
ENERGY BUSINESS

Consumo:       48,420 kWh
Costo:         RD$ XXX,XXX
Variación:     +8.2%
Peak Demand:   XXX kW
Mayor carga:   HVAC
```

Para: restaurantes, hoteles, oficinas, comercios, industrias, condominios, escuelas, hospitales.

---

## 34. MÓDULO 31 — CONDOMINIOS

Para administradores de edificios.

```
120 unidades

Consumo total:    84,320 kWh
Áreas comunes:    12,420 kWh
Ascensores:        3,200 kWh
Bombas:            4,800 kWh
Iluminación:       2,100 kWh
```

---

## 35. MÓDULO 32 — ADMINISTRACIÓN

Para la plataforma (nosotros como administradores).

```
Users
Meters
Bills
Consumption
Devices
Alerts
Incidents
AI usage
API
System health
```

---

## 36. MÓDULO 33 — ENERGY INTELLIGENCE RD

Fase avanzada. Plataforma agregada y anonimizada.

```
🇩🇴 ENERGY INTELLIGENCE

Consumo nacional
Demanda
Generación
Solar
Interrupciones
Pérdidas
Tendencias
```

**Importante:** No exponer información personal. Datos anonimizados y agregados.

---

## 37. Flujo de cada botón (ejemplos)

### `Agregar factura`

```
Mobile
↓
POST /bills/upload
↓
Storage
↓
OCR Worker
↓
Invoice Parser
↓
Validation
↓
PostgreSQL
↓
Energy Engine
↓
Dashboard
```

### `Ver consumo`

```
Mobile
↓
GET /consumption
↓
FastAPI
↓
PostgreSQL/Timescale
↓
Aggregation
↓
JSON
↓
Chart
```

### `Analizar`

```
Mobile
↓
POST /analysis
↓
Energy Engine
↓
LLM
↓
Structured response
↓
Mobile
```

### `Conectar medidor`

```
Mobile
↓
Device pairing
↓
MQTT/API
↓
Device registry
↓
Telemetry
↓
Timeseries DB
```

---

## 38. Stack Tecnológico Definitivo

### Mobile

- React Native
- Expo
- TypeScript
- Expo Router
- TanStack Query
- Zustand
- NativeWind
- React Hook Form
- Zod

### Web

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- TanStack Query
- Zod

### Backend

- Python
- FastAPI
- Pydantic
- SQLAlchemy
- Alembic

### Database

- PostgreSQL (Neon para MVP)
- Preparado para: TimescaleDB, pgvector

### Cache / Jobs

- Redis
- Workers (Celery / RQ / worker propio)

### IA

- LLM API
- Energy Copilot
- Tool Calling
- Energy MCP

### Backend Structure

```text
services/api/
├── app/
│   ├── main.py
│   ├── core/
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── security.py
│   │   ├── logging.py
│   │   └── dependencies.py
│   ├── modules/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── homes/
│   │   ├── meters/
│   │   ├── devices/
│   │   ├── consumption/
│   │   ├── bills/
│   │   ├── tariffs/
│   │   ├── forecasts/
│   │   ├── anomalies/
│   │   ├── recommendations/
│   │   ├── alerts/
│   │   ├── interruptions/
│   │   ├── solar/
│   │   ├── batteries/
│   │   └── copilot/
│   ├── integrations/
│   │   ├── ocr/
│   │   ├── weather/
│   │   ├── utilities/
│   │   ├── storage/
│   │   └── iot/
│   └── shared/
│       ├── schemas/
│       ├── exceptions/
│       ├── utils/
│       └── events/
└── tests/
```

---

## 39. Monorepo Estructura

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
│
├── docs/
│
│
└── docker-compose.yml
```

---

## 40. MVP REAL — 10 módulos

```
01. Onboarding
02. Dashboard
03. Consumo
04. Facturas
05. Proyección
06. Ahorro
07. Alertas
08. Equipos
09. Energy Copilot
10. Perfil
```

Core loop:
```
Factura → Consumo → Análisis → Proyección → Ahorro
```

---

## 41. Evolución del Producto

### FASE 1 — Digitalizar consumo
```
Factura → Historial → Dashboard
```

### FASE 2 — Inteligencia
```
Forecast → Anomalies → Recommendations → AI
```

### FASE 3 — Tiempo real
```
Smart Meter → Telemetry → Live dashboard
```

### FASE 4 — Control
```
IoT → Smart plugs → Devices → Automation
```

### FASE 5 — Generación
```
Solar → Battery → Inverter
```

### FASE 6 — Business
```
Hotels → Businesses → Condos → Industry
```

### FASE 7 — Energy Intelligence RD
```
National data → Analytics → Maps → Forecasting → APIs
```

---

## 42. Arquitectura Final

```text
                         ⚡ ENERGY RD
                              │
             ┌───────────────┼───────────────┐
             │               │               │
          MOBILE            WEB            ADMIN
        React Native       Next.js         Next.js
             │               │               │
             └───────────────┼───────────────┘
                             │
                          FastAPI
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
    Energy Engine        AI Engine          IoT Engine
                             │                   │
                             ▼                   ▼
                       Energy Copilot        MQTT
                                                 │
             ┌───────────────────────────────────┘
                             │
                      PostgreSQL/Neon
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
          Timescale      pgvector        Storage
              │
              ▼
        Energy Analytics
```

---

## 43. Visión Final

Energy RD evoluciona de:

> "Aplicación para consultar consumo"

a:

> "Plataforma inteligente para comprender, controlar, optimizar y eventualmente automatizar el consumo energético."

La evolución es:

```
CONOCER → MEDIR → ENTENDER → PREDECIR → AHORRAR → CONTROLAR → GENERAR → OPTIMIZAR → INTELIGENCIA ENERGÉTICA
```
