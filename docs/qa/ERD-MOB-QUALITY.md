# ERD-MOB-QUALITY — Evidencia de smoke test móvil

Recorrido probado: **vivienda → factura → historial → dashboard → alerta → equipos**, sobre la API real
(FastAPI + PostgreSQL en Docker, seed de 5 viviendas piloto).

## 1. Pruebas automatizadas

| Capa | Herramienta | Qué cubre | Resultado |
|---|---|---|---|
| Unitarias | Vitest (`npm test -w apps/mobile`) | validación de factura y equipo, formato, config de URL, conteo de alertas | ✅ 54/54 |
| Recorrido vs API real | Vitest (`src/e2e/pilotFlow.e2e.test.ts`) | mismo cliente HTTP que la app: 5 viviendas, 422 por kWh negativo, alta de factura, historial, dashboard con REAL/ESTIMATED/PROJECTED, alerta crítica unread→read→dismissed, equipos ESTIMATED, limpieza | ✅ 8/8 (local ×3 y job `mobile-e2e` de CI) |
| UI en Android | Maestro (`maestro/pilot-flow.yaml`) | toques reales sobre Expo Go: onboarding, selección PILOT-05, validación en pantalla, registro, dashboard con alerta, descartar alerta, equipos, borrar factura | ✅ 74/74 pasos (4 corridas OK) |
| UI en iOS | Maestro (mismo flujo) | mismo recorrido en simulador iPhone | ✅ 74/74 pasos |

Todas las corridas dejan la base como estaba (PILOT-05 vuelve a 2 facturas y 0 alertas).

## 2. Entorno del smoke test

| | |
|---|---|
| Fecha | 2026-10-04 |
| Android | Emulador `EnergyRD_Pixel` (Pixel 8, Android 16 / API 36, arm64) — API en `http://10.0.2.2:8000` |
| iOS | Simulador iPhone 18 Pro, iOS 27.0 (Xcode 27) — API en `http://localhost:8000` |
| App | Expo Go (SDK 57), bundle de Metro de `apps/mobile` |
| API | Docker `energy-api`, migración `0003`, seed piloto |

## 3. Evidencia manual (capturas de la corrida)

Capturas por plataforma en `apps/mobile/maestro/evidence/android/` y `.../ios/` (mismos nombres).

| Paso | Captura | Verificado |
|---|---|---|
| 1. Onboarding | `01-onboarding.png` | "Paso 1 de 3", texto de bienvenida |
| 2. Dashboard inicial PILOT-05 | `02-dashboard-inicial.png` | aviso de datos demo, sin alerta, etiquetas REAL / ESTIMADO / PROYECTADO, nota de resolución mensual |
| 3. Validación | `03-validacion.png` | kWh = -5 → "No puede ser negativo", no se envía |
| 4. Historial | `04-historial.png` | factura ago-2026 (400 kWh) aparece primero |
| 5. Dashboard con alerta | `05-dashboard-alerta.png` | "Alerta crítica" +66.67 % (240.00 → 400.00 kWh), proyección 466.67 kWh PROYECTADO |
| 6. Alertas | `06-alertas.png` | "Crítica · nueva", período base 1–31 jul 2026, umbral 40 %, badge 1 en la pestaña; tras "Descartar" → "Sin alertas" |
| 7. Equipos | `07-equipos.png` | 136.80 kWh/mes ESTIMADO, explica 35.34 % de la factura, nota "No es una medición" |

## 4. Hallazgos durante el smoke test

| Hallazgo | Tipo | Estado |
|---|---|---|
| Pestañas sin ícono (cuadros ☒) | Bug de la app | ✅ Corregido: íconos Ionicons (`@expo/vector-icons`) |
| Mensaje de alerta mezclaba "240.00" con "400" | Bug de la API | ✅ Corregido: kWh siempre con 2 decimales (+ prueba) |
| Menú de desarrollo de Expo Go tapa la app en el primer arranque | Entorno de prueba | ✅ El flujo lo cierra |
| Tutorial de stylus de Android 16 sobre el teclado | Entorno de prueba | ✅ `run-smoke.sh` lo desactiva |
| `clearState` de Maestro desconecta adb en el emulador | Entorno de prueba | ✅ `run-smoke.sh` limpia con `adb shell pm clear` (iOS: reinstala Expo Go) |
| iOS: pestañas y tarjetas exponen etiquetas agrupadas; teclado numérico sin "return" | Entorno de prueba | ✅ `testID` en las pestañas (`tab-*`); el flujo cierra el teclado tocando una etiqueta |
| Metro con `CI=1` no recarga cambios | Entorno de prueba | Documentado: arrancar Metro sin `CI` |

## 5. Cómo repetirlo

```bash
docker compose up -d --wait postgres api          # API migrada + seed
npm run test:e2e -w apps/mobile                   # recorrido vs API real (8 pruebas)

# Smoke test de UI — Android
cd apps/mobile && EXPO_PUBLIC_API_URL=http://10.0.2.2:8000 npx expo start --android --port 8081
apps/mobile/maestro/run-smoke.sh android          # en otra terminal

# Smoke test de UI — iOS (simulador encendido)
cd apps/mobile && npx expo start --ios --port 8081
apps/mobile/maestro/run-smoke.sh ios
```

Checklist manual rápido (sin Maestro), en Expo Go:

- [ ] Onboarding → elegir una vivienda → Inicio muestra su nombre y distribuidora.
- [ ] Facturas: registrar una con kWh negativo → error en el campo; corregir → aparece en el historial.
- [ ] Inicio: cada valor tiene etiqueta REAL / ESTIMADO / PROYECTADO; no hay datos horarios.
- [ ] Alertas: badge con el número de no leídas; "Marcar como leída" y "Descartar" funcionan.
- [ ] Equipos: agregar, editar y eliminar; el total cambia y se etiqueta ESTIMADO.
- [ ] Sin red/API apagada: cada pantalla muestra error con "Reintentar".
