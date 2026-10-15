# Mapa de dependencias (2026-10-13)

Calculado desde los `import` reales (no desde los `package.json`). Cuenta de importaciones sin pruebas ni `e2e`.

```text
frontend-web/app ──────┬──► @energyrd/core            (35)
               ├──► @energyrd/api-client      (15)
               └──► @energyrd/api-contracts   (14)
frontend-mobile/app ───┬──► @energyrd/core            (40)
               ├──► @energyrd/api-client      (20)
               └──► @energyrd/api-contracts   (25)
frontend-web/admin  ──► @energyrd/core            (1: vocabulario OCR; sin cliente HTTP ni contratos, habla solo con su BFF)

@energyrd/core          ──► @energyrd/api-contracts  (5, solo tipos)
@energyrd/api-client    ──► @energyrd/api-contracts  (1)
@energyrd/api-contracts ──► (hoja: Zod generado desde Pydantic)
```

Comprobaciones: **sin ciclos** entre paquetes, **sin imports cruzados** entre `web`, `mobile` y `admin`, y los paquetes no
importan aplicaciones (lo exige `scripts/check_architecture.py` en CI).

## Backend (`backend/api/app`)

`api/v1` (20 routers) → `services` (48 módulos) → `models` (21) y `schemas` (21). Los cálculos puros viven en
`services/calculations.py`, `consumption_calc.py` y `tariff_calc.py` y no pueden importar FastAPI, ORM ni `app.*`
(también lo exige el CI). Los routers no controlan transacciones. El ciclo `equipment↔recommendations` se eliminó
el 2026-10-13 (`shares_pct` → `calculations.py`).

## Qué se comparte

| Compartido en `@energyrd/core` | Por qué |
|---|---|
| Tokens de marca (`tokens.ts`) | Una paleta: Tailwind (web) y `theme.ts` (móvil) la derivan de aquí. |
| Formato, calidad del dato, tendencias, gráficas | Lógica sin DOM ni React Native. |
| Hora de República Dominicana (`rdTime.ts`) | Antes había tres copias (web, móvil, apagones). |
| Vocabulario OCR (`ocr.ts`) | Nació en el móvil; método/páginas, confianza y qué error se reintenta, para móvil, web y admin. |
| Reglas de validación de entrada y de rango | La API sigue siendo la autoridad; esto da feedback inmediato. |
| Cliente HTTP, errores y paginación (`api-client`), contratos (`api-contracts`) | Una sola forma de hablar con la API. |

## Qué se duplica a propósito

| Duplicado | Motivo |
|---|---|
| Componentes visuales web (DOM + Tailwind) y móvil (React Native + `StyleSheet`) | No son compartibles. `UI_KIT.md` descartó `packages/ui`. La paridad se mantiene por nombres, props y pruebas. |
| Tamaños de control (36/44 px web, 44 pt móvil) | Cada plataforma sigue su convención táctil (ver `UI_DENSITY.md`). |
| Navegación, almacenamiento seguro, permisos y notificaciones | Capacidades nativas distintas. |
| `frontend-web/admin` sin kit visual | Consola provisional con estilos en línea; adoptará un kit con el Módulo 4. Ya comparte el vocabulario OCR de `core`. |

## Objetivos del prompt que NO se adoptaron, y por qué

`pnpm` + Turborepo, `packages/design-tokens`, `packages/validation`, `packages/business-rules`, Expo Router y shadcn/ui eran
objetivos del prompt, no requisitos. El repo usa npm workspaces, `core` ya cubre tokens, validación y reglas puras, y
React Navigation funciona. Migrarlos no aporta valor medido y rompería el CI actual.
