# ERD-E2E-MAESTRO-AUTH — recorrido móvil con cuentas (sin OCR)

**Aceptación parcial: iOS ejecutado; Android pendiente.** El criterio de cierre exige dos corridas verdes por plataforma: no se marca la tarea completa por tener únicamente iOS.

## Verificación independiente 2026-10-11

- Base de integración: `fef74c83eeabeef2479bf92267200b132b317fa5`, en una copia aislada de `Dev`, con correcciones aún sujetas al CI de integración.
- iPhone 18 Pro simulado, iOS 27.0, Expo Go SDK 57, Maestro.
- API autenticada propia `:8011`, PostgreSQL 16 propio `:55439`, sin datos piloto. Metro propio `:8081`.
- **Dos corridas completas consecutivas: exit 0, 132.5 s y 135.0 s.** Solo cuentas sintéticas. No se envió correo real.
- Registro con validación y consentimiento → onboarding de seis pasos → perfil de vivienda → consumo vacío de 30 días → meta y formulario → cerrar/reingresar → seleccionar vivienda persistida → confirmación de solicitud de recuperación.
- Las siete capturas de la última corrida se inspeccionaron visualmente. El dashboard y consumo muestran ausencia de datos, no cero ni cifras inventadas; la meta inicial persiste después de reingresar.
- Evidencia publicable sin cuentas, contraseñas ni trazas privadas: [`native-ios-auth.json`](evidence/dev-recovery-2026-10-11/native-ios-auth.json). Las capturas y comandos originales quedan fuera de git. `04-perfil` captura el dashboard después de volver del perfil; no es una captura del editor.

## Fallos encontrados y corregidos

1. **Producto:** `nativeDeps` importaba dinámicamente `react-native`; Metro enumera getters y accedía a `PushNotificationIOS`, ausente en Expo Go. Se importa únicamente `Platform` estáticamente. Regresión con el loader real de Metro: RED con el mismo error, GREEN tras la corrección; ver `push.native-loading.test.ts`.
2. **Harness:** faltaba confirmar el diálogo nativo de cierre de sesión. Selector de confirmación restringido al botón debajo del título del diálogo.
3. **Harness:** `back` no navegaba en iOS. `back.yaml` conserva `back` en Android y usa gesto nativo desde el borde en iOS.
4. **Harness:** el botón de meta estaba parcialmente tapado por la barra inferior; se desplaza hasta visibilidad completa y se espera al formulario.
5. **Harness:** iOS agrupa nombre y distribuidora en la tarjeta de vivienda. Se verifica el nombre con regex y se pulsa su `testID`.

Expo Go tenía su burbuja de desarrollo encima de `profile-entry`. Se movió por gesto al lado izquierdo antes de las corridas verdes; no se borraron SecureStore ni datos de Expo Go. Si vuelve a cubrir un control, moverla fuera de su área antes de repetir el flujo. Esto no ocurre en una aplicación de distribución.

## Qué sigue sin certificarse

- **Android:** no se arrancó ni ejecutó un emulador en esta verificación. Ejecutar dos veces y adjuntar evidencia.
- **Teclado software:** el simulador no lo mostró; los pasos condicionales de «Listo» se omitieron. Las entradas sí se completaron.
- **Recuperación completa con correo real:** el flujo solo llega a la confirmación anti-enumeración; abrir el enlace y cambiar la contraseña en el navegador requiere otra prueba.
- Push real, VoiceOver/TalkBack, dispositivo físico y development/release build.
- Facturas reales y OCR móvil: fuera del alcance de este flujo.

## Reproducción

1. API con `AUTH_ENABLED=true`, base dedicada vacía, correo de desarrollo; Metro con `EXPO_PUBLIC_AUTH_ENABLED=true` y URL de esa API. No reutilizar la base del piloto.
2. `apps/mobile/maestro/run-auth.sh ios` o `… android`, apuntando exclusivamente a esa infraestructura. El script usa cuentas sintéticas únicas.
3. Ajustar la burbuja de Expo Go si tapa controles. Repetir dos veces por plataforma, revisar cada captura y mantener las credenciales/trazas fuera de git.

`src/maestroFlows.test.ts` comprueba YAML, existencia de identificadores y salvaguardas del harness. Estas pruebas estáticas no prueban comportamiento nativo por sí solas.
