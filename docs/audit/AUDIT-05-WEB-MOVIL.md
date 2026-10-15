# AUDIT-05 — Web, Android, iOS y comunicación con la API

Modo: solo lectura. Rama `Dev` @ `5e761c6`. Alcance: `frontend-web/app` (Next.js 15), `frontend-mobile/app` (Expo 57 / RN 0.86), contrato con `backend/api`.
Evidencia nueva de esta auditoría: lectura de código + `expo config --type prebuild --json` (resuelve plugins y permisos reales; no modifica nada ni instala dependencias).

## 1. Web (Next.js)

### 1.1 Qué está bien (con evidencia)
- **Tokens fuera del alcance de JavaScript.** Access y refresh viajan en cookies `HttpOnly`, `SameSite=Strict`, `Secure` fuera de desarrollo y con prefijo `__Host-` (`src/lib/auth/bff.ts:43-48, 64, 88, 494-498`). No hay `localStorage`/`sessionStorage` con credenciales: solo el id del hogar activo y una marca de cambio de cuenta entre pestañas (`src/lib/session.tsx:37-78`, `src/app/restablecer-contrasena/page.tsx:13`). Con auth habilitada, el id de hogar ni siquiera se persiste (`session.tsx:78`).
- **BFF como único canal.** Con auth activa el cliente usa `createLiveApi("", bffFetch)` (`src/lib/api/index.ts:10`): el navegador nunca llama directo a la API ni conoce su URL.
- **BFF con lista blanca estricta** (`bff.ts`, 546 líneas): método permitido, ruta que coincida con una de las rutas conocidas (`phase2Route`/`domainRoute`/auth/recuperación), query con claves y valores validados (`bff.ts:386-395`), `Content-Type` exigido (JSON o multipart solo en OCR) → 415, y **validación de la respuesta con Zod** (`schema`): lo que la API devuelva fuera del contrato no llega al navegador. Ruta desconocida → 404.
- **CSRF:** en toda mutación exige `Origin === WEB_ORIGIN` y, si existe, `Sec-Fetch-Site: same-origin` (`bff.ts:380`), más `SameSite=Strict`. Sólido.
- **Época de sesión por navegador** (`__Host-erd-epoch`): evita que un login tardío reviva una sesión tras un logout (carrera login/logout). Diseño poco común y bien probado (~20 archivos de test del BFF).
- **Middleware** (`src/middleware.ts`): puerta para las páginas protegidas, valida la sesión contra `/api/bff/auth/me` (no solo la presencia de la cookie), `redirect: "manual"`, sin tocar `cookies()` de RSC. Rutas de token en fragmento (`/restablecer-contrasena`, `/invitacion`) con `Referrer-Policy: no-referrer` y `Cache-Control: no-store`.
- **Respuestas del BFF** con `Cache-Control: no-store, private`, `Vary: Cookie`, `X-Content-Type-Options: nosniff` (`bff.ts:68`).
- **Fallo cerrado en configuración:** `next.config.mjs:6-17` impide arrancar en producción sin `NEXT_PUBLIC_AUTH_ENABLED=true`, y exige `API_BASE_URL`/`WEB_ORIGIN` como orígenes HTTPS sin credenciales, ruta, query ni fragmento.
- **Sin sumideros XSS:** 0 usos de `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function` ni `document.write` en `src` (búsqueda exhaustiva).
- Variables públicas (`NEXT_PUBLIC_*`/`EXPO_PUBLIC_*`): `AUTH_ENABLED` (booleano), `API_URL` (URL) y `NEXT_PUBLIC_SENTRY_DSN/ENVIRONMENT/RELEASE` (el DSN de Sentry es público por diseño y hoy no está configurado). **Ningún secreto** en variables públicas. `BFF_API_SHARED_SECRET` es solo servidor (`bff.ts:18, 400`) y la API lo valida con longitud/entropía mínimas en prod (`config.py:147-152`).
- Accesibilidad: 262 atributos `aria-*`/`role` en componentes web, prueba `a11y.test.tsx` y recorrido de teclado en E2E (`06-states-keyboard.spec.ts`). **No** hay verificación automática con axe/jest-axe (solo comprobaciones estáticas a medida) y no se ha hecho auditoría con lector de pantalla.

### 1.2 Hallazgos web

| ID | Sev. | Hallazgo | Evidencia | Corrección sugerida |
|---|---|---|---|---|
| F05-01 | **Media** | **Sin cabeceras de seguridad HTTP en las páginas:** no hay `Content-Security-Policy`, `X-Frame-Options`/`frame-ancestors`, `Strict-Transport-Security`, `Permissions-Policy` ni `X-Content-Type-Options` global. `next.config.mjs` no define `headers()` y el middleware solo fija `Referrer-Policy` en 2 rutas. Las únicas CSP existentes son las de la descarga de documentos de la API (`documents.py:66-67`). Consecuencia: clickjacking posible (la app puede incrustarse en un iframe ajeno) y sin segunda línea de defensa si algún día se introduce un sumidero XSS. HSTS dependería del proxy de Render (no verificable desde el repositorio). | `frontend-web/app/next.config.mjs:22-27`, `src/middleware.ts:5-12` | `headers()` en `next.config.mjs` con CSP (nonce o `'self'` + `connect-src 'self'`), `frame-ancestors 'none'`, HSTS, `Permissions-Policy` (`camera=(), microphone=()`), `nosniff`; `poweredByHeader: false`. Validar con E2E de cabeceras |
| F05-02 | Baja | `source_url` de la tarifa llega como `str` libre desde la API y se usa en `<a href>`; sin validación de esquema (`javascript:`/`data:`). Hoy solo lo escriben datos sembrados por el administrador (no existe endpoint de escritura de tarifas), por lo que no es explotable ahora, pero depende de una premisa de datos | `GoalProgressCard.tsx:36-40`, `schemas/tariff.py:39,51`, `generated.ts:342,401` | Renderizar solo si `new URL(u).protocol === "https:"`; y/o `AnyHttpUrl` en el esquema |
| F05-03 | Baja | `poweredByHeader` no desactivado → `X-Powered-By: Next.js` | `next.config.mjs` | `poweredByHeader: false` |
| F05-04 | Baja | El refresh token vive en una cookie llamada `erd-logout`/`__Host-erd-logout` con `Path=/` (el prefijo `__Host-` lo exige): viaja en cada petición al origen web, incluidas navegaciones de página. Es `HttpOnly` y `Strict`, por lo que el riesgo es residual, pero amplía su exposición a logs de proxy/CDN si registran cabeceras `Cookie` | `bff.ts:44, 498` | Documentar; confirmar que el proxy no registra `Cookie`. Alternativa: cookie sin `__Host-` con `Path=/api/bff/auth` |
| F05-05 | Baja | `target="_blank"` correcto (`rel="noopener noreferrer"`), único enlace externo | `GoalProgressCard.tsx:39` | — (OK) |
| F05-06 | Info | Sin axe automático; sin prueba con lector de pantalla | — | Añadir `@axe-core/playwright` a las E2E existentes (no requiere cambiar la app) |

## 2. Móvil (Android / iOS)

### 2.1 Qué está bien
- **Tokens en almacén seguro:** `expo-secure-store` con `WHEN_UNLOCKED_THIS_DEVICE_ONLY` (`src/auth/secureStore.ts:6`): no se respalda ni migra a otro dispositivo. `AsyncStorage` solo se usa en modo sin auth (piloto local) y para datos no sensibles (`src/store/session.ts:21`).
- **Refresco de sesión de un solo vuelo** (`auth/session.ts:22,91-118`): evita rotaciones concurrentes que la API trataría como reutilización (revoca la familia); logout revoca el refresh emitido si la operación se cancela.
- **TLS fail-closed:** en release exige `EXPO_PUBLIC_API_URL` con `https://` estricto (regex sin credenciales/ruta); si no, la app muestra un error sin hacer ninguna petición (`src/config.ts:11-61`). `http://` solo en `__DEV__`. `eas.json` apunta a HTTPS en staging y prod.
- **Validación defensiva de tokens** (longitud ≤4096, tipo, `expires_in`) en `auth/client.ts:33-36`; sin `console.*` en el código de la app (cero fugas por logs).
- **Sin deep links activos:** el esquema `energyrd` está declarado (`app.json:5`) pero no hay manejadores de `Linking`/`openURL` en `src`; la superficie de ataque por enlaces es hoy nula (las invitaciones se aceptan con token en la app autenticada).
- Accesibilidad móvil: 123 `accessibilityLabel/Role/accessible`, prueba estática (`a11yStatic.test.ts`) y flujos Maestro versionados (`maestroFlows.test.ts`). **No ejecutados en dispositivo** (sin emulador en este entorno).

### 2.2 Configuración resuelta (evidencia real)
`expo config --type prebuild` devuelve para Android: `permissions = [RECORD_AUDIO, READ_EXTERNAL_STORAGE, WRITE_EXTERNAL_STORAGE, INTERNET]` (los dos de almacenamiento llevan `maxSdkVersion=32` en los manifiestos de los módulos). Plugins aplicados automáticamente: `expo-notifications`, `expo-image-picker`, `expo-document-picker`, `expo-file-system` (el plugin de image-picker se aplica aunque no figure en `app.json`, por lo que **no** falta el plugin; pero con valores por defecto).

### 2.3 Hallazgos móviles

| ID | Sev. | Hallazgo | Evidencia | Corrección sugerida |
|---|---|---|---|---|
| F05-07 | **Media** | **Permiso `RECORD_AUDIO` innecesario:** el plugin de `expo-image-picker` lo añade por defecto (`microphonePermission !== false`, verificado en `node_modules/expo-image-picker/plugin/build/withImagePicker.js:10-17`) y la app no graba audio ni video. Riesgo de aviso/rechazo en Google Play (política de permisos, formulario *Data safety*) y menor privacidad por defecto. `READ/WRITE_EXTERNAL_STORAGE` también aparecen en la configuración resuelta, pero vienen de los manifiestos de `expo-file-system`/`expo-image-picker` con `maxSdkVersion="32"` (solo Android ≤12L): bajo impacto | salida de `expo config --type prebuild`; `node_modules/expo-image-picker/android/src/main/AndroidManifest.xml:7-8`; `frontend-mobile/app/app.json:31-33` | `["expo-image-picker", {"microphonePermission": false, "cameraPermission": "…texto en español…", "photosPermission": "…"}]`; opcionalmente `android.blockedPermissions: ["android.permission.RECORD_AUDIO"]` |
| F05-08 | Media | **Textos de permisos iOS por defecto (en inglés, genéricos):** como el plugin no está configurado, `NSCameraUsageDescription`/`NSPhotoLibraryUsageDescription`/`NSMicrophoneUsageDescription` toman el texto por defecto. La revisión de App Store pide un propósito claro y específico (y en el idioma de la app); el micrófono sobrante además provoca preguntas de revisión | `app.json` (sin `infoPlist`/opciones de plugin) | Configurar los textos en el plugin (mismo cambio que F05-07) |
| F05-09 | Baja | Falta `ios.config.usesNonExemptEncryption: false` (o declaración equivalente): App Store Connect pedirá el cumplimiento de exportación en cada subida | `app.json:20-23` | Declararlo en `app.json` tras confirmar que solo se usa HTTPS/OS crypto |
| F05-10 | Baja | `eas.json` solo define `submit.production.android`; no hay configuración iOS (esperable aún; falta cuenta de desarrollador) | `eas.json:42-49` | Pendiente de despliegue (ERD-DEPLOY-01, bloqueado externamente) |
| F05-11 | Baja | `android:allowBackup` queda con el valor por defecto de la plantilla Expo (no controlado en `app.json`); los tokens están en SecureStore (clave de Keystore, no restaurable en otro dispositivo), pero conviene fijarlo explícitamente | `app.json` (sin `android.allowBackup`) | `"android": {"allowBackup": false}` y verificar en el manifiesto de un `prebuild` |
| F05-12 | Info | Sin *certificate pinning* (aceptable para piloto; TLS del sistema + HTTPS obligatorio) | `src/api`, `src/auth/transport.ts` | Evaluar tras el despliegue real; no es bloqueante |
| F05-13 | Info | No ejecutado: instalación en emulador/dispositivo, Maestro, TalkBack/VoiceOver, pruebas de compatibilidad (dispositivos bajos, rotación, tamaño de fuente) | — | Cubierto por tareas bloqueadas ERD-E2E-MAESTRO-AUTH, ERD-A11Y-NATIVE, ERD-RELEASE-QA |

## 3. Comunicación cliente ↔ API

- Web: navegador → BFF (mismo origen, cookies) → API (con `X-Forwarded-Client-Ip` firmado con HMAC para que el *rate limit* use la IP real del navegador, no la del BFF; la API solo confía en esa cabecera si la firma es válida: `api/auth_abuse.py:30-40`).
- Móvil: Bearer directo a la API por HTTPS; el contrato (OpenAPI → Zod) es el mismo para ambos clientes.
- Errores: ambos clientes mapean `ApiError(status, message, fieldErrors, code)`; mensajes en español sin detalle interno; el 500 de la API es genérico con `request_id`.
- Consistencia web↔móvil: lógica de dominio compartida en `packages/core` (tarifas, score, recomendaciones, interrupciones); utilidades de fecha/formato duplicadas (ver AUDIT-02).

## 4. Riesgos de tiendas

- **Google Play:** F05-07 (permisos), *Data safety* y política de eliminación de cuenta (la app ya ofrece borrado de cuenta y exportación de datos: ✔ requisitos de Play/App Store 5.1.1(v)), política de privacidad pública (en `docs/legal`, **pendiente de revisión legal final**, ERD-LEGAL-FINAL).
- **App Store:** F05-08/F05-09; Sign in with Apple no aplica (no hay login social); la eliminación de cuenta desde la app existe.
- Ambos: sin ejecutar QA de release en dispositivos (F05-13).

## 5. Limitaciones

- No se construyó ni se levantó `next start` para inspeccionar cabeceras reales (la ausencia de `headers()` se demuestra por código; HSTS/cabeceras añadidas por Render no son verificables desde el repositorio).
- No se ejecutó la app móvil; el análisis es estático + configuración Expo resuelta. El manifiesto final de Android/Info.plist de iOS solo se obtiene tras `expo prebuild` (no ejecutado para no generar carpetas nativas en el repositorio).
