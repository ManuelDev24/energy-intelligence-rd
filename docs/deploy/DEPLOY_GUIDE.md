# Guía de despliegue — Energy RD (ERD-DEPLOY-01)

Para: el dueño del proyecto. Todo lo de esta guía lo hace **una persona con acceso a las cuentas**; el repo
ya trae la configuración (`render.yaml`, `apps/mobile/eas.json`) y nada se ha desplegado todavía.

Stack aprobado: **Render** (región *Virginia*) para API (Docker) y web (Node) · **Neon** Postgres (proyecto
existente en `us-east`) · **Expo EAS** para la app móvil · **Resend** para correo · **Sentry Free** más adelante.

Entornos:

| | Staging | Production |
|---|---|---|
| Rama Git | `Dev` | `main` |
| Deploy | Automático en cada commit a `Dev` | **Manual** (auto-deploy apagado) |
| Instancias Render | Free (duermen tras 15 min sin tráfico; despiertan en ~1 min) | Starter (siempre encendidas) |
| Base de datos | Neon, rama `staging` | Neon, rama principal (`production`) |
| Migraciones | A mano antes de cada deploy con cambios de esquema (Render no permite *pre-deploy* en Free) | Automáticas: `preDeployCommand: alembic upgrade head` (si falla, no se publica) |
| App móvil | perfiles EAS `development` / `preview` | perfil EAS `production` |

Documentos relacionados: `docs/deploy/ENV_CHECKLIST.md` (todas las variables), `docs/RELEASE_CHECKLIST.md`.
Comprobación local antes de tocar Render: `python3 infrastructure/deploy/check_deploy_config.py`.

---

## 0. Antes de empezar (decisiones y requisitos)

1. **`render.yaml` debe estar en `main`.** Render lee el Blueprint de la rama que elijas; usaremos `main`
   para que un cambio en `Dev` no altere producción. Flujo normal: commit en `Dev` → `QA` → `main`.
2. **Dominio propio (opcional pero recomendado para correo).** Resend exige un dominio verificado para enviar
   a cualquier destinatario. Si aún no hay dominio, staging y producción pueden usar los subdominios
   `*.onrender.com` para web/API, pero el correo de recuperación no saldrá hasta verificar un dominio.
3. **Límites anti-abuso detrás de proxy** (ver aviso en `ENV_CHECKLIST.md`): para staging basta con los
   valores por defecto; para producción decide subir `AUTH_*_LIMIT` o encargar la tarea de IP confiable.
4. **Recuperación de contraseña**: las variables `EMAIL_BACKEND`, `RESEND_API_KEY`, `EMAIL_FROM`,
   `PASSWORD_RESET_URL` ya están en el Blueprint; confirma la ruta exacta de `PASSWORD_RESET_URL` cuando ese
   trabajo se integre.
5. Ten a mano un gestor de contraseñas: cada secreto se copia de la consola del proveedor y se pega
   directamente en Render. **Nunca** en el repo, chats ni capturas.

## 1. Neon: ramas, roles y bases de datos

Proyecto Neon existente (región AWS `us-east-1`, la más cercana a Render *Virginia*).

1. Console → *Branches*. La rama principal (`main`/`production`) será **producción**. Si tiene otro nombre,
   puedes renombrarla a `production` (opcional).
2. *Create branch* → nombre `staging`, padre = rama principal, **desde el estado actual** (*head*).
   (Las ramas son copias *copy-on-write*: no duplican costo de almacenamiento al inicio.)
3. **Rol y base por entorno** (contraseñas distintas):
   - En la rama `staging`: *Roles* → *Add role* → `erd_staging`. *Databases* → *New database* → `energyrd`,
     propietario `erd_staging`.
   - En la rama principal: *Add role* → `erd_prod`. *New database* → `energyrd`, propietario `erd_prod`.
   - Copia cada contraseña al gestor en el momento: Neon solo la muestra al crearla (se puede *reset*).
4. Cadenas de conexión: *Connect* → elige rama, rol `erd_…` y base `energyrd` → **desactiva *Connection
   pooling*** (conexión directa). Copia la URL y **cambia el prefijo** `postgresql://` por
   `postgresql+psycopg://`. Resultado:
   `postgresql+psycopg://erd_prod:CLAVE@ep-xxxx.us-east-1.aws.neon.tech/energyrd?sslmode=require&channel_binding=require`
5. (Recomendado para producción) Plan **Launch**: historial de restauración de hasta 7 días (Free: 6 h).
6. (Endurecimiento futuro, opcional) separar un rol de migraciones (propietario) de un rol de runtime con
   solo `SELECT/INSERT/UPDATE/DELETE`. Hoy las migraciones crean triggers y tablas con el mismo rol.

## 2. Primera migración de **staging** (desde tu Mac)

Render Free no ejecuta *pre-deploy*, así que staging se migra a mano, ahora y cada vez que `Dev` traiga una
migración nueva (archivo nuevo en `services/api/app/alembic/versions/`), **antes** de que llegue el deploy.

```bash
cd services/api
read -rs DATABASE_URL   # pega la URL de staging (no queda en el historial) y Enter
export DATABASE_URL
uv run alembic upgrade head
uv run alembic current        # debe mostrar la última revisión con "(head)"
unset DATABASE_URL
```

Alternativa con la imagen Docker (sin entorno Python local):
`docker build -t erd-api services/api && docker run --rm -e DATABASE_URL erd-api alembic upgrade head`
(con `DATABASE_URL` exportada como arriba). **No** uses `MIGRATE_ON_START` ni `SEED_PILOT`: la API los
rechaza en staging/production.

Producción **no** necesita este paso: su primer deploy ejecuta `alembic upgrade head` como *pre-deploy*.

## 3. Resend (correo transaccional)

1. Crear cuenta en resend.com (plan Free: 3 000 correos/mes, 100/día).
2. *Domains* → *Add domain*. Recomendado: `TU-DOMINIO` para producción y `staging.TU-DOMINIO` para staging
   (reputación separada). Región `us-east-1`.
3. Crear en el DNS del dominio **exactamente** los registros que muestra Resend. Típicamente:

   | Tipo | Nombre (host) | Valor | Para qué |
   |---|---|---|---|
   | MX | `send` (o `send.staging`) | `feedback-smtp.us-east-1.amazonses.com` (prioridad 10) | Rebotes / Return-Path |
   | TXT | `send` (o `send.staging`) | `v=spf1 include:amazonses.com ~all` | **SPF** |
   | TXT | `resend._domainkey` (o `resend._domainkey.staging`) | `p=MIGf…` (clave que da Resend) | **DKIM** |
   | TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@TU-DOMINIO` | **DMARC** (empezar en `p=none`, luego `quarantine`) |

   Si el dominio ya tiene un registro SPF en la raíz, no lo dupliques: el SPF de Resend va en el subdominio
   `send`. Debe existir un solo registro DMARC por dominio.
4. Esperar a que Resend marque el dominio como **Verified** (de minutos a 72 h según DNS).
5. *API Keys* → crear una key **por entorno**, permiso *Sending access* restringido a su dominio. Guárdalas
   para el paso 4 (`RESEND_API_KEY`).

## 4. Render: cuenta, GitHub y Blueprint

1. Crear cuenta en render.com (workspace plan *Hobby*, $0). Añadir tarjeta (producción usa Starter).
2. *Account settings* → *Git* → conectar GitHub e instalar la app de Render **solo** en el repo
   `ManuelDev24/energy-intelligence-rd`.
3. Verificar que `render.yaml` está en `main` (paso 0.1).
4. Dashboard → *New* → **Blueprint** → elige el repo → rama **`main`** → nombre del Blueprint `energy-rd`.
5. Render muestra el proyecto `energy-rd` con 2 entornos y 4 servicios
   (`energyrd-api-staging`, `energyrd-web-staging`, `energyrd-api-prod`, `energyrd-web-prod`) y **pide los
   valores `sync: false`**. Rellénalos con `ENV_CHECKLIST.md`:

   | Servicio | Variables a pegar |
   |---|---|
   | `energyrd-api-staging` | `DATABASE_URL` (staging), `AUTH_SIGNING_KEY` (nueva), `CORS_ORIGINS=https://energyrd-web-staging.onrender.com`, `RESEND_API_KEY` (staging), `EMAIL_FROM`, `PASSWORD_RESET_URL` |
   | `energyrd-web-staging` | `API_BASE_URL=https://energyrd-api-staging.onrender.com`, `WEB_ORIGIN=https://energyrd-web-staging.onrender.com` |
   | `energyrd-api-prod` | `DATABASE_URL` (prod), `AUTH_SIGNING_KEY` (otra nueva), `CORS_ORIGINS=https://energyrd-web-prod.onrender.com` (o dominio propio), `RESEND_API_KEY` (prod), `EMAIL_FROM`, `PASSWORD_RESET_URL` |
   | `energyrd-web-prod` | `API_BASE_URL=https://energyrd-api-prod.onrender.com`, `WEB_ORIGIN=https://energyrd-web-prod.onrender.com` |

   Generar cada `AUTH_SIGNING_KEY`: `python3 -c 'import secrets;print(secrets.token_urlsafe(48))'`.
6. *Apply*. Render crea los servicios y hace el **primer deploy de los cuatro** (aunque producción tenga
   auto-deploy apagado). Desde ese momento los servicios Starter facturan.
7. **Confirmar las URLs reales** (cabecera de cada servicio). Si alguna tiene sufijo (p. ej.
   `energyrd-api-staging-x1y2.onrender.com`), corrige en *Environment* las variables que la usan
   (`CORS_ORIGINS`, `API_BASE_URL`, `WEB_ORIGIN`, `PASSWORD_RESET_URL`) y `apps/mobile/eas.json`; luego
   *Manual Deploy* → *Deploy latest commit* (la web incrusta valores en el build).
8. Dominio propio (opcional): servicio → *Settings* → *Custom Domains* → añadir `app.TU-DOMINIO` (web) y
   `api.TU-DOMINIO` (API), crear los CNAME que indica Render y esperar el certificado. Después actualizar las
   mismas variables del paso 7 y redeployar web y API.

Comportamiento esperado de producción en cada deploy: build de la imagen → `alembic upgrade head` en una
instancia aparte → arranque → health check `/health` → cambio de tráfico sin caída. Si la migración o el
health check fallan, la versión anterior sigue sirviendo.

**Publicar en producción** (después de promover a `main`): servicio `energyrd-api-prod` → *Manual Deploy* →
*Deploy latest commit*; cuando esté *Live*, lo mismo en `energyrd-web-prod`. API primero (las migraciones
deben ser compatibles con la web anterior durante unos minutos).

## 5. Verificar `/health` y humo post-deploy

```bash
API=https://energyrd-api-staging.onrender.com     # o la de producción
WEB=https://energyrd-web-staging.onrender.com
curl -s $API/health/live                # {"status":"alive"}
curl -s $API/health                     # {"status":"healthy","database":"ok"}  (503 = BD inaccesible)
curl -s -o /dev/null -w '%{http_code}\n' $WEB/login     # 200
# CORS: un origen ajeno NO debe recibir Access-Control-Allow-Origin
curl -s -D - -o /dev/null -H 'Origin: https://evil.example' $API/health | grep -i access-control || echo "OK: sin CORS para origen ajeno"
```

En staging la primera petición tras 15 min de inactividad tarda ~1 min (la instancia Free despierta).

### Checklist de humo (cada entorno, tras cada deploy a producción)

- [ ] `GET /health` → 200 `{"status":"healthy","database":"ok"}`; en *Logs* no hay errores de arranque.
- [ ] En *Events* del deploy de producción aparece el *pre-deploy* `alembic upgrade head` como exitoso.
- [ ] `uv run alembic current` contra la BD (o el log del pre-deploy) muestra la revisión `head` esperada.
- [ ] Web: `/login` carga con HTTPS válido; `/legal` muestra términos y privacidad.
- [ ] Registro de una cuenta de prueba (acepta términos) → inicio de sesión → `/dashboard` carga.
- [ ] En el navegador, las cookies de sesión son `__Host-erd-*` con `Secure` y `HttpOnly`.
- [ ] Crear un hogar, registrar una factura y una lectura; ver el consumo; cerrar sesión y verificar que
      `/dashboard` redirige a `/login`.
- [ ] Recuperación de contraseña (cuando esté integrada): llega el correo desde `EMAIL_FROM`, el enlace abre
      `PASSWORD_RESET_URL`, y el correo pasa SPF/DKIM/DMARC (en Gmail: *Mostrar original* → `PASS`).
- [ ] App móvil (build `preview` para staging / `production` para prod): inicia sesión contra la API correcta.
- [ ] Eliminar la cuenta de prueba desde *Cuenta* (verifica el borrado) — no dejar datos de prueba en producción.
- [ ] Revisar *Metrics* de Render (memoria < 80 % de 512 MB) y el panel de Neon (conexiones, CPU).

## 6. EAS (app móvil)

Requisitos: cuenta Expo (expo.dev), y para tiendas **Apple Developer Program** (USD 99/año) y **Google Play
Console** (USD 25 pago único). Identificador de la app: `do.energyrd.app` (iOS y Android, ya en `app.json`).

1. Instalar la CLI y entrar: `npm install -g eas-cli` → `eas login`.
2. Vincular el proyecto (una vez): `cd apps/mobile && eas init`. Escribe `extra.eas.projectId` en
   `app.json`: hacer commit de ese cambio en `Dev`.
3. Revisar `apps/mobile/eas.json`: `EXPO_PUBLIC_API_URL` de `development`/`preview` apunta a la API de
   staging y la de `production` a la API de producción. Si cambiaron las URLs (sufijo o dominio propio),
   editarlas antes de compilar.
4. Build interno para probar contra staging:
   `eas build --profile preview --platform android` (APK instalable) y/o `--platform ios` (requiere
   registrar dispositivos con `eas device:create`).
5. Perfil `development` (cliente de desarrollo): antes hay que añadir la dependencia `expo-dev-client`
   siguiendo el procedimiento del repo (versión con `npx expo install`, instalación desde la raíz con
   `npm install expo-dev-client@<versión> -w apps/mobile`). Sin ella, usar `preview`.
6. Producción: `eas build --profile production --platform all`. EAS gestiona firmas y numeración
   (`appVersionSource: remote` + `autoIncrement`). La primera vez pedirá crear/descargar credenciales: deja
   que EAS las genere y guarde.
7. Envío a tiendas:
   - **Android**: Google exige que la **primera** subida del `.aab` se haga a mano en Play Console (crear la
     app `do.energyrd.app`, prueba interna). Después: crear una *service account* con acceso a la API de Play,
     subir su JSON con `eas credentials` (no al repo) y usar
     `eas submit --profile production --platform android` (pista `internal`, estado `draft`).
   - **iOS**: crear la app en App Store Connect con el bundle `do.energyrd.app` y luego
     `eas submit --profile production --platform ios` (pedirá iniciar sesión en Apple; sube a TestFlight).
8. Fichas de tienda: política de privacidad pública (URL de `/legal` en producción) y declaración de datos.
   El texto legal sigue siendo **borrador sujeto a revisión legal (Ley 172-13 RD)**: no publicar en tiendas
   sin esa revisión.

## 7. Costos estimados (USD, precios publicados a oct-2026; confirmar al contratar)

| Concepto | Staging | Production |
|---|---|---|
| Render workspace *Hobby* | $0 | $0 (Pro $25/mes solo si se necesitan equipos/aislamiento) |
| Render API | Free $0 | Starter $7/mes |
| Render web | Free $0 | Starter $7/mes |
| Render minutos de build | 500 min/mes incluidos en Hobby (luego $5 por 1 000) | (compartidos) |
| Neon Postgres | rama en el plan actual, $0 | Free $0 (6 h de restauración, 0,5 GB) **o** Launch por uso (gasto típico ~$15/mes, hasta 7 días de restauración) — recomendado Launch |
| Resend | Free $0 (3 000/mes, 100/día, compartido) | Free $0; Pro $20/mes si se superan 100/día |
| Expo EAS | Free $0 (15 builds Android + 15 iOS/mes, cola baja prioridad) | Free $0 (Starter $19/mes para cola prioritaria) |
| Apple Developer | — | $99/año (~$8,25/mes) |
| Google Play | — | $25 una vez |
| Sentry (futuro) | Free $0 | Free $0 |
| Dominio | — | según registrador (anual) |
| **Total mensual** | **$0** | **~$14/mes** con Neon Free · **~$29/mes** con Neon Launch (+ Apple $99/año, Google $25 único) |

Notas Free de Render: 750 h/mes de instancia Free por workspace (las instancias dormidas no consumen);
filesystem efímero (la API no escribe en disco); no apto para producción.

## 8. Rollback

**Código (Render)** — servicio → *Events* / *Deploys* → elegir el último deploy bueno → **Rollback**.
- Revierte la imagen/build, **no** la base de datos. Hacer rollback desde el Dashboard **desactiva el
  auto-deploy** del servicio: en staging, reactivarlo después (*Settings* → *Auto-Deploy*).
- Si el deploy malo incluía una migración, el código anterior correrá contra el esquema nuevo. Por eso las
  migraciones deben ser **aditivas/compatibles hacia atrás** (*expand → migrate → contract*): añadir columnas
  nulas o con default primero, borrar/renombrar en un release posterior.
- Orden: rollback de la **web** y de la **API** al par de versiones que funcionaban juntas.

**Base de datos (`alembic downgrade`) — último recurso, con cautela:**
- Varios `downgrade()` **borran tablas/columnas con datos** (p. ej. autenticación, lecturas, metas,
  detalle de factura, consentimiento). Un downgrade en producción destruye datos de usuarios.
- Las tablas de originales/auditoría tienen triggers de inmutabilidad; un downgrade parcial puede dejar
  estados inconsistentes si se interrumpe.
- Procedimiento si es imprescindible: (1) poner la API en mantenimiento o escalar a 0; (2) **crear antes una
  rama Neon de respaldo** (`backup-AAAAMMDD-HHMM`); (3) `alembic downgrade <revisión>` desde tu Mac con la
  URL de producción (como en el paso 2); (4) desplegar el código que corresponde a esa revisión;
  (5) humo completo. Preferir siempre **una migración nueva que corrija** (roll-forward) antes que downgrade.

## 9. Respaldo y restauración (Neon)

- Neon guarda historial para **restauración a un instante** (PITR): Free hasta **6 h** (o 1 GB de cambios),
  Launch hasta **7 días**, Scale hasta **30 días** (configurable en *Settings* → *Storage* / *History*).
- **Antes de cada deploy a producción con migraciones**: Console → *Branches* → *Create branch* desde la
  rama de producción, nombre `pre-deploy-AAAAMMDD`. Es instantáneo y sirve de punto de vuelta; borrar las
  antiguas para no acumular ramas.
- Restaurar: *Branches* → rama de producción → **Restore** → elegir fecha/hora (o desde otra rama). Neon
  conserva el estado previo como rama de respaldo. La cadena de conexión de la rama restaurada no cambia,
  pero conviene reiniciar la API después (*Manual Deploy* → *Restart service*).
- Copia fuera de Neon (recomendado mensual o antes de cambios grandes): `pg_dump` con la URL **sin** el
  prefijo `+psycopg`, guardado cifrado fuera del repo. Probar una restauración en una rama nueva al menos
  una vez.

## 10. Lista final de pasos manuales del dueño

1. Promover a `main` los archivos de despliegue (`render.yaml`, `apps/mobile/eas.json`, `docs/deploy/`,
   `infrastructure/deploy/`, Dockerfile/entrypoint).
2. Neon: crear rama `staging`, roles `erd_staging`/`erd_prod`, bases `energyrd`; copiar las dos URLs; decidir
   plan (Free o Launch) para producción.
3. Migrar staging desde tu Mac (paso 2).
4. Resend: cuenta, dominio(s), registros DNS SPF/DKIM/DMARC, verificación, dos API keys.
5. Render: cuenta, tarjeta, conectar GitHub (solo este repo), crear el Blueprint desde `main`, pegar los
   secretos, confirmar URLs reales y corregir variables si hay sufijo.
6. Decidir los límites anti-abuso para producción (ver `ENV_CHECKLIST.md`).
7. Verificar `/health` y completar el checklist de humo en staging; después *Manual Deploy* de producción y
   repetir el humo.
8. Expo: cuenta, `eas init` (commit del `projectId`), build `preview`; Apple Developer y Google Play si se
   publicará en tiendas; primera subida manual a Play Console.
9. Revisión legal de términos/privacidad antes de publicar en tiendas o abrir producción a usuarios.
10. (Más adelante) Sentry Free: crear proyectos y pedir la integración en código.
