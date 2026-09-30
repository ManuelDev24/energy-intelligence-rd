# ⚡ ENERGY RD — MASTER PROJECT CONTEXT

## Objetivo

Construir una plataforma de inteligencia y gestión energética para República Dominicana.

## Principio Fundamental

La aplicación debe responder:
1. ¿Cuánto estoy consumiendo?
2. ¿Cuánto estoy gastando?
3. ¿Cuánto voy a pagar?
4. ¿Por qué estoy consumiendo tanto?
5. ¿Qué equipos están generando mayor consumo?
6. ¿Dónde puedo ahorrar?
7. ¿Estoy teniendo un comportamiento anormal?
8. ¿Qué está pasando con mi servicio eléctrico?
9. ¿Me conviene instalar energía solar?
10. ¿Cómo puedo optimizar mi consumo?

## MVP (10 módulos)

1. Onboarding
2. Dashboard
3. Consumo
4. Facturas
5. Proyección de factura
6. Ahorro
7. Alertas
8. Equipos
9. Energy Copilot
10. Perfil

## Stack Tecnológico

- Mobile: React Native + Expo + TypeScript
- Web: Next.js + React + TypeScript + Tailwind CSS + shadcn/ui
- Backend: Python + FastAPI + Pydantic + SQLAlchemy + Alembic
- Database: PostgreSQL + Neon (MVP) → TimescaleDB + pgvector
- Cache: Redis
- IA: LLM API + MCP + energy-rd-mcp
