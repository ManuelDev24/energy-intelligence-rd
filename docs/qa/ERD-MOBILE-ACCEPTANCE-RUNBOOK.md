# Aceptación móvil pendiente — guía de ejecución (12 ítems)

Estado al 2026-10-15 sobre `Dev` (CI verde en 91156ca). **Ninguno de estos ítems puede cerrarse desde la sesión
de desarrollo en la nube**: necesitan un emulador/teléfono, credenciales de terceros, datos reales o una decisión
de producto. El código de cada uno está construido y probado con lógica, API real y Playwright (web); lo que falta
es evidencia en dispositivo. Esta guía convierte cada ítem en una corrida con criterio de paso y evidencia concreta.

## Reglas de evidencia (valen para todos los ítems)

1. Un ítem solo pasa a «aceptado» con **evidencia adjunta**; «no vi errores» no cuenta. Marcar ☐ → ☑ en el
   documento `ERD-*` del ítem, con fecha, plataforma, versión de SO y commit probado.
2. Solo cuentas sintéticas (`@example.com`) salvo en los ítems que exigen correo/datos reales (5, 10, 4). Capturas,
   facturas, tokens y trazas privadas **no entran a git**; se publica un JSON/MD con resultados por campo, sin valores
   personales (patrón de `apps/mobile/maestro/evidence/dev-recovery-2026-10-11/native-ios-auth.json`).
3. Cada recorrido se repite **dos veces seguidas** por plataforma (criterio de `ERD-E2E-MAESTRO-AUTH`).
4. Base y API propias (no la del piloto `:8000/:5433`), `AUTH_ENABLED=true`, base vacía, proveedor de correo de
   desarrollo salvo indicación contraria.
5. Si algo falla: anotar el fallo y abrir corrección; **no** repetir hasta que salga verde sin registrar el rojo.

## Preparación común (una vez)

| Necesidad | Detalle |
|---|---|
| Android | Emulador API 34+ (o teléfono con depuración USB), Expo Go o development build (`eas build -p android --profile development`) |
| iOS | Simulador iOS 17+ (Mac) o TestFlight/development build para dispositivo físico |
| Maestro | `curl -Ls https://get.maestro.mobile.dev \| bash`; flujos en `apps/mobile/maestro/` |
| API | `AUTH_ENABLED=true ENVIRONMENT=development docker compose up -d --wait postgres api` en una base nueva; `COPILOT_PROVIDER=fake` para el Copilot |
| Metro | `EXPO_PUBLIC_AUTH_ENABLED=true EXPO_PUBLIC_API_URL=<url de esa API> npx expo start --port 8081` |
| Build instalable | `apps/mobile/eas.json` ya define `development`, `preview` (APK) y producción; requiere cuenta EAS y `projectId` |

---

## 1. `ERD-E2E-MAESTRO-AUTH` — dos recorridos Android + recuperación por correo

- **Estado:** iOS: dos corridas verdes (132.5 s / 135.0 s). Android: sin ejecutar.
- **Pasos:** `apps/mobile/maestro/run-auth.sh android` dos veces seguidas (emulador con Expo Go; `APP_ID=host.exp.exponent`).
  Recuperación: con un buzón controlado (p. ej. Mailpit/Resend en sandbox), pedir recuperación, **abrir el enlace del correo**
  en el dispositivo, fijar contraseña nueva, iniciar sesión con ella; el enlace usado una vez no debe funcionar de nuevo.
- **Pasa si:** 2/2 corridas exit 0; las 7 capturas muestran vacío (no ceros), meta persistida tras reingresar; recuperación
  completa; contraseña antigua rechazada; enlace reutilizado → error claro.
- **Evidencia:** `native-android-auth.json` (mismo formato que iOS) + nota de recuperación en `ERD-E2E-MAESTRO-AUTH.md`.
- **Nota:** el enlace debe abrir la app (deep link) o la web; confirmar cuál abre en cada plataforma.

## 2. `ERD-ONB-ACCEPTANCE` — onboarding Android; errores y reanudación en ambas plataformas

- **Estado:** iOS onboarding verde. Idempotencia de `POST /homes` implementada (API, web, móvil) y probada sin dispositivo.
- **Pasos:** (a) onboarding completo en Android ×2. (b) **Pérdida de respuesta:** en el paso final, activar modo avión justo
  después de pulsar «Crear» (o cortar la API tras el POST con `docker pause`), reactivar red y reintentar → debe quedar
  **una sola** vivienda y la misma `Idempotent-Replayed: true`. (c) Matar la app a mitad del onboarding y reabrir → reanuda en el
  paso guardado sin perder datos. (d) API caída → «Sin conexión» + Reintentar (`maestro/qa/api-down-flow.yaml`, `api-up-flow.yaml`).
- **Pasa si:** nunca hay dos viviendas; reanudación correcta; errores en español, sin códigos internos.
- **Verificación en BD:** `SELECT count(*) FROM homes` por usuario = 1 tras el reintento.

## 3. `ERD-BILL-LIVE-QA` / `ERD-OCR-PROD` — foto/archivo → OCR → corrección → confirmación

- **Pasos (ambos SO):** subir foto de cámara y archivo PDF/imagen; esperar el borrador OCR; corregir un campo a mano;
  confirmar; ver factura creada y **el original descargable** (enlace firmado de 120 s); cancelar un OCR en curso; reintentar.
- **Pasa si:** el borrador marca campos dudosos, ninguna cifra se confirma sin acción humana, el original abre, el estado
  `OCR en curso/fallido/listo` es coherente tras cerrar y reabrir la app, y un archivo >límite o de tipo inválido se rechaza con mensaje.
- **Requiere:** worker + Tesseract en la API, almacenamiento (hoy local; bucket en nube = decisión de despliegue). Usar facturas
  anonimizadas; no versionarlas.

## 4. `ERD-OCR-REAL-QA` — evaluación con facturas reales anonimizadas

- **Estado:** 21/22 campos en tres imágenes **usadas para afinar** → no es aceptación.
- **Qué entrega el dueño:** ≥3 facturas por distribuidora (EDESUR, EDENORTE, EDEESTE): una foto nítida, una de celular con
  ángulo/sombra, un PDF auténtico del portal, una con consumo promediado. Tapar nombre, dirección, NIC/contrato y medidor; **no** tapar
  fechas, lecturas, consumo ni total. Estas facturas **no deben usarse para ajustar el OCR** (conjunto de prueba ciego).
- **Cómo se evalúa:** se escribe la verdad de cada campo fuera de git; se corre el OCR; se publica solo la tabla campo→{correcto, ausente,
  incorrecto} (sin valores). Meta mínima propuesta: 0 valores incorrectos confirmables sin revisión; ≥90 % de campos clave correctos o ausentes
  con marca de duda. Si no se alcanza, se ajusta y se **consigue un conjunto nuevo** para volver a medir.
- **Bloqueo:** sin esas facturas no hay aceptación. Nada en esta sesión sustituye datos reales.

## 5. `ERD-PROF-01` / `ERD-SHARE-01` — perfil, invitaciones, aceptación, revocación

- **Pasos (2 cuentas, 2 dispositivos o 1 dispositivo + web):** editar perfil (nombre, avisos) y reabrir → persiste; cambiar contraseña →
  otras sesiones se cierran; A invita a B por correo **real** (Resend con dominio verificado, ERD-DEPLOY-01); B abre el enlace en el móvil,
  acepta, ve la vivienda; A revoca → B pierde acceso al instante (probar con una petición real); invitación caducada/ya usada → mensaje claro;
  límites anti-spam (pendientes por vivienda, diario).
- **Pasa si:** todo lo anterior se observa en Android e iOS; el correo llega con el enlace correcto (no `localhost`).
- **Bloqueo:** dominio de correo verificado y `APP_BASE_URL` de staging.

## 6. `ERD-AI-CHAT-MOBILE` — cierre nativo

- **Con `COPILOT_PROVIDER=fake` (sin gasto):** enviar, ver el streaming por fragmentos, cancelar a mitad, historial tras reabrir, teclado
  (no tapa el campo; «enviar» accesible), fuentes con su etiqueta de calidad, límite diario (`copilot_limit`), Copilot apagado (`copilot_disabled`).
- **Release build:** repetir el streaming en una build **release** (no solo Metro): `expo/fetch` puede comportarse distinto por versión de Expo.
  Si en release llega todo de golpe, registrar el fallo (hay que ajustar el transporte).
- **Claude real en staging:** **requiere tu autorización de gasto**. Propuesta: `COPILOT_PROVIDER=anthropic` con `ANTHROPIC_API_KEY` solo en el secreto de staging, tope diario
  bajo (`COPILOT_DAILY_MESSAGES_PER_USER` y `COPILOT_DAILY_TOKENS_PER_USER`) y una cuenta de prueba; ≤20 preguntas de la lista de `ERD-AI-CHAT-MOBILE.md`. Revisar que no filtre datos de otra vivienda.

## 7. `ERD-RPT-01-MOBILE` / `ERD-CLAIM-01-MOBILE` / `ERD-HELP-01-MOBILE`

- **Informes:** período válido e inválido; «Abrir PDF» (visor del sistema vía enlace firmado de 120 s — si tarda más de 2 min en volver a la app,
  debe pedir otro) y «Compartir»; vacío sin facturas.
- **Reclamaciones:** abrir desde una factura, formulario con teclado, enviar, ver resumen congelado, añadir nota, referencia de la distribuidora,
  cerrar con/sin nota; duplicado (`claim_conflict`) y límite (`claim_limit`).
- **Ayuda:** búsqueda con y sin acentos, categorías, artículo, enlace de contacto (`SUPPORT_EMAIL` real).
- **Con lector de pantalla:** cada pantalla navegable por orden lógico, botones con nombre, errores anunciados (ver ítem 9).
- **Bloqueo:** `SUPPORT_EMAIL` real y revisión editorial de los 16 artículos.

## 8. `ERD-UI-KIT` / `ERD-CHARTS-01` — componentes en dispositivo

- **Pasos:** BottomSheet (abrir/cerrar con gesto y «atrás», foco), selector de rango de fechas (límites, rango inválido), gráficos con
  datos reales sintéticos (≥3 puntos → sparkline; <3 → sin tendencia), mini-tendencias plana vs variable, navegación con parámetros,
  safe areas (notch/isla/barra de gestos), rotación, teléfono pequeño (360 px) y tablet.
- **Pasa si:** nada queda bajo el notch/barra, sin cortes de texto, los gráficos coinciden con la API (comparar 3 cifras), sin parpadeo.

## 9. `ERD-A11Y-NATIVE` — VoiceOver y TalkBack

- Usar la tabla de 12 pruebas de `ERD-A11Y-NATIVE.md` (columnas VoiceOver / TalkBack) y **añadir** las pantallas nuevas:
  Copilot (anuncio de fuentes y de «escribiendo…»), Informes (cifras con su calidad), Reclamaciones (estado del caso), Ayuda (búsqueda y resultados).
- Además: texto del sistema al 200 %, objetivos táctiles ≥44 pt (iOS)/48 dp (Android), reducir movimiento. El modo oscuro **no existe** hoy:
  si se exige, es trabajo nuevo (no una verificación).
- **Pasa si:** las 12+ filas ☑ en ambos lectores con la nota de lo observado; cualquier ☐ se convierte en un defecto con captura.

## 10. `ERD-ALERT-02` — push real

- **Preparar (solo tú):** proyecto Firebase (FCM) + clave de servidor/`google-services.json`; credenciales APNs (clave `.p8`) en EAS;
  `eas init` para el `projectId`; development build nuevo (el módulo `expo-notifications` es nativo).
- **Pasos:** registrar el token en dos dispositivos; provocar una alerta (factura con variación alta o pago próximo); recibir con la app en primer plano,
  segundo plano y cerrada; tocar la notificación → abre la alerta correcta; revocar permiso → la app lo indica y sigue funcionando por correo;
  cerrar sesión → el token se desactiva (no llegan avisos).
- **Pasa si:** llega ≤1 min, una sola vez por alerta (sin duplicados), con texto en español sin datos sensibles en la pantalla bloqueada.

## 11. `ERD-ANOM-01-COMPLETE` / `ERD-SCORE-01-CLOSE` — calibración y decisión del Score

- **Calibración (datos autorizados):** necesita ≥6 meses de facturas de varias viviendas con el visto bueno de sus dueños. Procedimiento: correr el
  motor en modo lectura sobre esas viviendas, que una persona etiquete cada hallazgo (útil / falso / dudoso) y ajustar umbrales en **una**
  constante versionada (`SCORE_VERSION`/versión de reglas), nunca en silencio. Publicar solo agregados (tasa de falsos positivos por regla).
- **Decisión recomendada sobre el Score (para que respondas sí/no):**
  1. *Historial de puntajes:* **no ahora.** Hoy se deriva de los datos actuales y no se guarda; guardar historial exige migración y definir
     qué pasa cuando cambian los pesos entre versiones. Recomendado solo después de calibrar y congelar `SCORE_VERSION`.
  2. *Pesos editables por persona:* **no.** Rompe la comparabilidad y la explicación; los pesos siguen siendo constantes versionadas.
  3. Mientras no haya datos reales, los hallazgos se presentan como **pistas con confianza**, no diagnósticos (ya es así).
- **Pendiente derivado:** «patrones nuevos» y estacionalidad semanal siguen sin implementar.

## 12. `ERD-INT-01-CLOSE` — apagones e historial en dispositivo

- **Pasos:** registrar apagón (inicio, fin, nota), editar y borrar con confirmación, fechas futuras/fin anterior al inicio rechazadas, historial
  ordenado y paginado, vivienda ajena inaccesible, offline con Reintentar.
- **Fuera de alcance (trabajo adicional, no parte de la aceptación):** alertas automáticas de apagón y cruce con medidores.

---

## Orden recomendado de ejecución (un solo día de dispositivo)

1. Preparar emulador + simulador + API/Metro propios (común).
2. Ítem 1 (Android ×2) → 2 (errores/reanudación) → 8 (UI-kit) → 9 (lectores de pantalla), porque comparten el mismo entorno y cuentas.
3. Ítems 3, 6 (fake), 7 y 12 con la misma sesión.
4. Ítems que necesitan terceros, en paralelo y por separado: 5 (dominio de correo), 10 (FCM/APNs/EAS), 4 (facturas), 11 (datos autorizados), 6 real (gasto).

## Qué necesito de ti para avanzar (decisiones y recursos)

| # | Decisión / recurso | Ítems |
|---|---|---|
| 1 | Acceso a un emulador Android / teléfono y a un Mac o simulador iOS (esta sesión en la nube no puede arrancarlos) | 1, 2, 3, 6–9, 12 |
| 2 | Dominio de correo verificado + `PASSWORD_RESET_URL` e `INVITATION_URL` de staging | 1 (recuperación), 5 |
| 3 | Cuenta EAS, proyecto Firebase y clave APNs | 10 |
| 4 | Facturas anonimizadas (≥3 por distribuidora) para evaluación ciega | 3, 4 |
| 5 | Autorización de gasto y tope para Claude real en staging | 6 |
| 6 | `SUPPORT_EMAIL` real, responsable y tiempo de respuesta; revisión editorial de la ayuda | 7 |
| 7 | Datos autorizados para calibrar; sí/no a las dos decisiones del Score | 11 |
