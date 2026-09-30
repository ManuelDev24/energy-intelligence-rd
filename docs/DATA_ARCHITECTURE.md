# Energy RD — Data Architecture

## Capas de Datos

1. RAW (datos exactos como llegan)
2. STAGING (limpiar y normalizar)
3. CORE (fuente de verdad principal)
4. ENERGY DOMAIN (modelo energético)
5. ANALYTICS (métricas y agregaciones)
6. AI/INTELLIGENCE (forecast, anomalías, recomendaciones)

## Entidades Principales

- users, profiles, homes, businesses
- meters, devices, solar_systems, batteries, inverters
- consumption_readings, meter_readings, device_readings, generation_readings
- bills, bill_items, bill_readings, tariff_versions
- forecasts, anomalies, recommendations, energy_scores, alerts
- interruptions, incidents, service_events
- conversations, messages, tool_calls

## Data Status

- REAL: Dato obtenido directamente de fuente confiable
- ESTIMATED: Estimación basada en datos disponibles
- PROJECTED: Proyección hacia futuro
- INFERRED: Inferencia de modelo

## Fuentes de Datos

- Usuarios (manual bills, facturas escaneadas)
- Distribuidoras (EDESUR, EDENORTE, EDEESTE)
- SIE (tarifas, regulación)
- MEM (generación, demanda)
- ONE (estadísticas nacionales)
- IoT (smart meters, smart plugs)
- Clima (temperatura, radiación solar)
