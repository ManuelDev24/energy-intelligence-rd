# ERD-E2E-MAESTRO-AUTH — recorrido móvil con cuentas (iOS y Android, sin OCR)

**Estado: AUTORADO Y VALIDADO ESTÁTICAMENTE. NO EJECUTADO en iOS ni Android.** Este entorno no tiene simulador, emulador ni Maestro.
No se declara «pasa»: el criterio de cierre (corrida verde en las dos plataformas) sigue abierto y requiere a Manuel o un runner con simuladores.

## Qué existe
| Pieza | Para qué |
|---|---|
| `apps/mobile/maestro/auth-flow.yaml` | registro (con validación y términos) → onboarding de 6 pasos → perfil → consumo vacío honesto → meta → cerrar sesión → volver a entrar → solicitar recuperación de contraseña |
| `apps/mobile/maestro/run-auth.sh android\|ios` | correo único por corrida (`maestro-<epoch>@example.com`), variables, captura en `evidence/auth/` |
| `apps/mobile/src/maestroFlows.test.ts` | **corre en CI**: el YAML es válido; **cada `id:` existe como `testID` en la app**; el flujo no toca OCR; el script no lleva secretos; el comprobador detecta un id inventado |

## Qué sí se comprobó
- 5 pruebas estáticas pasan (YAML y existencia de cada identificador). Esto atrapa renombres de `testID` que romperían el flujo, que es la causa más común de flujos Maestro rotos.

## Qué NO se comprobó (y por qué importa)
- Que cada paso **funcione en un dispositivo**: tiempos de espera, el teclado de iOS (se usa el botón «Listo» solo si aparece), el menú de Expo Go, `back` en cada plataforma, texto exacto de cabeceras.
- **Recuperación de contraseña de punta a punta**: el flujo llega hasta la confirmación («si existe una cuenta…»). El enlace del correo se abre en el **navegador** del teléfono (no en la app); ese tramo **no está automatizado**. En web sí se probó el ciclo completo (ver `ERD-ONB-ACCEPTANCE.md`).
- Android e iOS: ninguna de las dos plataformas se ejecutó con este flujo.
- Con un development build en lugar de Expo Go hay que pasar `APP_ID`; el menú de desarrollo es distinto.

## Cómo cerrarlo (lo hace quien tenga simuladores)
1. API con `AUTH_ENABLED=true`, base vacía, correo de desarrollo; Metro con `EXPO_PUBLIC_AUTH_ENABLED=true`.
2. `apps/mobile/maestro/run-auth.sh android` y `… ios`; adjuntar capturas y duración; corregir lo que falle (los fallos probables son de sincronización, no de lógica).
3. Repetir dos veces seguidas por plataforma (criterio usado en ERD-UI-KIT).
