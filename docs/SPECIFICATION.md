# ⚡ ENERGY RD — ESPECIFICACIÓN GENERAL

## 1. Qué será la aplicación

**Energy RD** será una plataforma de gestión energética para República Dominicana.

### 10 Módulos del MVP

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

## 2. Arquitectura

Mobile (React Native + Expo) → Web (Next.js) → Platform (FastAPI + PostgreSQL)

## 3. Core Loop

FACTURA → CONSUMO → ANÁLISIS → PROYECCIÓN → ALERTA → AHORRO → NUEVO CONSUMO

## 4. Distribuidoras

- EDESUR
- EDENORTE
- EDEESTE

## 5. Fases de Evolución

- FASE 1: MVP (10 módulos)
- FASE 2: Smart Meter, IoT, Series Temporales
- FASE 3: Solar, Baterías, Inversores
- FASE 4: Business, Condominios, Hoteles
- FASE 5: Energy Intelligence RD (Analytics nacional)
