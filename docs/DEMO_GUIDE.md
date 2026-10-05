# Guía de demo — Energy RD (piloto de 5 viviendas)

Objetivo: que cualquier persona del equipo levante el proyecto **desde cero** en su máquina y haga la demo
de las 5 viviendas piloto **sin ayuda**. Tiempo estimado: 20–30 min la primera vez (descargas), 5 min después.

> Alcance del piloto: facturas mensuales manuales, comparación, proyección lineal, alertas por variación
> y estimación por equipos declarados. **No** hay OCR, IA, medidores inteligentes, solar ni datos horarios.
> Todos los datos del seed son **demo**: no son facturas reales de clientes.

---

## 1. Requisitos

| Herramienta | Versión | Para qué | Comprobar |
|---|---|---|---|
| Git | cualquiera | clonar | `git --version` |
| Docker (Docker Desktop u OrbStack) | con `docker compose` v2 | PostgreSQL + API | `docker compose version` |
| Node.js | 24 LTS (mín. 20) | web y móvil | `node -v` |
| npm | el que trae Node | dependencias JS | `npm -v` |
| Expo Go (opcional) | SDK 57 | móvil en teléfono | App Store / Play Store |
| uv + Python 3.12 (opcional) | solo para correr pruebas de la API fuera de Docker | | `uv --version` |

La API solo escucha en loopback por defecto. Para un teléfono físico configura
`API_BIND_ADDRESS=<IP de tu interfaz LAN privada>` en `.env`, recrea el servicio API y usa
`EXPO_PUBLIC_API_URL=http://<esa IP>:8000`. No abras la API del piloto a Internet.

Puertos que deben estar libres: **5433** (PostgreSQL), **8000** (API), **3000** (web), **8081** (Metro/Expo).

> El PostgreSQL de Docker usa el puerto **5433** a propósito: muchos Mac ya tienen un PostgreSQL nativo en 5432.

---

## 2. Levantar desde cero

```bash
git clone https://github.com/ManuelDev24/energy-intelligence-rd.git
cd energy-intelligence-rd
git checkout Dev            # o main, según lo que se vaya a demostrar

cp .env.example .env        # valores locales de desarrollo, sin secretos reales
cp apps/web/.env.example apps/web/.env.local

# Base de datos + API; el seed demo es una opción explícita
SEED_PILOT=true docker compose up -d --build --wait postgres api
```

Comprobar que la API está bien:

```bash
curl http://localhost:8000/health
# {"status":"healthy","database":"ok"}

curl -s http://localhost:8000/api/v1/homes | grep -o '"code":"PILOT-0[1-5]"' | sort | uniq | wc -l
# 5
```

Documentación interactiva de la API: <http://localhost:8000/docs>

### Web

```bash
npm ci
npm run dev:web             # http://localhost:3000
```

### Móvil (opcional)

```bash
npm run dev:mobile          # abre Metro en :8081
```

- **Teléfono con Expo Go:** teléfono y computadora en la misma Wi-Fi. Como la API escucha solo en loopback por defecto, primero sigue el ajuste de `API_BIND_ADDRESS` en §1; luego configura `EXPO_PUBLIC_API_URL=http://<IP-LAN-privada>:8000` al iniciar Expo.
- **Simulador iOS:** API en `localhost:8000`.
- **Emulador Android:** API en `10.0.2.2:8000`.
- Si la API está en otra dirección: `EXPO_PUBLIC_API_URL=http://<host>:8000 npm run dev:mobile`.

---

## 3. Las 5 viviendas piloto (qué debe verse)

Valores del seed actual. Si no coinciden, ver **§6 Problemas comunes** (probablemente hay datos de una demo anterior).

| Vivienda | Distribuidora · ciudad | Facturas | Última factura | vs. anterior | Proyección | Alerta | Equipos (estimado/mes) | Para mostrar |
|---|---|---|---|---|---|---|---|---|
| **PILOT-01** | EDESUR · Santo Domingo | 3 | 420 kWh · RD$ 5,600 | **+50.00 %** | 486.67 kWh | 🔴 **crítica** | 3 · 321 kWh (79 % de la factura) | Alerta crítica y aire acondicionado |
| **PILOT-02** | EDENORTE · Santiago | 3 | 315 kWh · RD$ 4,010 | +3.28 % | 315.00 kWh | — | 3 · 162.6 kWh | Consumo estable, sin alerta |
| **PILOT-03** | EDEESTE · San Pedro de Macorís | 2 | 225 kWh · RD$ 2,900 | **+25.00 %** | 270.00 kWh | 🟡 **advertencia** | 2 · 115.2 kWh | Advertencia con poco historial |
| **PILOT-04** | Otra · La Romana | 3 | 410 kWh · RD$ 5,600 | −10.87 % | 366.67 kWh | — | 3 · 429 kWh (**108 %**) | Bajada de consumo; la estimación por equipos es aproximada (puede superar la factura) |
| **PILOT-05** | EDESUR · Santo Domingo | 2 | 240 kWh · RD$ 3,050 | +9.09 % | 260.00 kWh | — | 2 · 136.8 kWh | Registrar una factura en vivo (ver §4.3) |

Etiquetas de calidad que aparecen junto a cada número (el móvil las muestra en español, la web en inglés):

- **REAL** — sale tal cual de una factura registrada.
- **ESTIMADO** / `ESTIMATED` — cálculo derivado (promedio diario, precio medio, equipos declarados). No es una medición.
- **PROYECTADO** / `PROJECTED` — tendencia lineal de la próxima factura.

| Función | Web | Móvil |
|---|---|---|
| Elegir vivienda, dashboard, historial y alta de facturas | ✅ | ✅ |
| Alertas (leer / descartar) | aviso en el dashboard | ✅ pestaña *Alertas* |
| Equipos declarados y estimado | — | ✅ pestaña *Equipos* |

---

## 4. Guion de la demo (≈10 min)

### 4.1 Web — panorama (3 min)

1. Abrir <http://localhost:3000> → **Acceso demo** → elegir **Vivienda piloto 01 (demo) · EDESUR** → *Entrar*.
   No se piden credenciales: la autenticación está fuera del alcance del piloto.
2. **Dashboard:** señalar “datos demo”, la **Alerta crítica** (+50 %, 280 → 420 kWh), y que cada número lleva su
   etiqueta REAL / ESTIMATED / PROJECTED (leyenda al final de la página). Resaltar “resolución monthly”:
   no se inventan datos horarios.
3. **Facturas:** historial de las 3 facturas de PILOT-01.
4. **Cambiar vivienda** (botón del menú lateral) → elegir **PILOT-02** → mismo dashboard **sin alerta**:
   el sistema no alarma si el consumo es estable.

### 4.2 Móvil — recorrido del usuario (5 min)

1. Abrir la app → onboarding de 3 pasos → *Elegir vivienda* → **PILOT-03** → *Continuar*.
2. **Inicio:** advertencia (+25 %) con solo 2 facturas.
3. **Alertas:** la pestaña muestra el número de no leídas. Abrir la alerta: período base, umbral (20 %),
   botones *Marcar como leída* y *Descartar*.
4. **Equipos:** total estimado del hogar y qué % de la factura explica. *Agregar equipo* →
   “Abanico”, “Sala”, `75` W, `8` h/día → *Guardar*: el total sube ≈ 18 kWh/mes, siempre como **ESTIMADO**.
5. **Viviendas:** cambiar a **PILOT-01** → Inicio muestra su alerta crítica.

### 4.3 En vivo — factura nueva que dispara una alerta (2 min)

Mejor en el **móvil** (tiene la pestaña *Alertas*); en la web se puede registrar en *Facturas → nueva*
y ver la alerta en el dashboard. Con **PILOT-05**:

1. *Registrar factura* → intentar `kWh = -5` → el formulario lo rechaza (“No puede ser negativo”).
2. Corregir: período `2026-08-01` → `2026-08-31`, `31` días, `400` kWh, `RD$ 5,200` → *Guardar*.
3. **Inicio:** aparece **alerta crítica +66.67 %** (240 → 400 kWh) y la proyección pasa a **466.67 kWh**.
4. **Alertas:** descartar la alerta.
5. **Dejar la demo limpia:** en *Facturas*, eliminar la factura de agosto (PILOT-05 vuelve a 2 facturas).

---

## 5. Verificación automática (opcional, 2 min)

Con la API levantada:

```bash
npm ci                                   # si no se hizo antes
npm run test:e2e -w apps/mobile          # recorrido vivienda → factura → dashboard → alerta: 8 passed
```

Smoke test de UI en simulador/emulador (requiere Maestro): ver `docs/qa/ERD-MOB-QUALITY.md`.

---

## 6. Problemas comunes

| Síntoma | Causa | Solución |
|---|---|---|
| `password authentication failed` desde la máquina | Te conectas al PostgreSQL nativo del Mac (5432) | Usar el puerto **5433** (`.env.example` ya lo trae) |
| `port is already allocated` (5433/8000/3000/8081) | Otro proceso usa el puerto | Cerrarlo, o cambiar `POSTGRES_PORT` / `API_PORT` en `.env` |
| La API no llega a *healthy* | La base aún arranca o falló la migración | `docker compose logs api` |
| Web: “No se pudo conectar con la API” | API apagada o URL distinta | `curl localhost:8000/health`; revisar `apps/web/.env.local` |
| Teléfono: error de red | Teléfono en otra red, o firewall | Misma Wi-Fi; o `EXPO_PUBLIC_API_URL=http://<IP>:8000` |
| Números distintos a la tabla §3 | Quedaron facturas/equipos de una demo anterior | Reinicio limpio (borra datos locales): `docker compose down -v && SEED_PILOT=true docker compose up -d --build --wait postgres api` |
| Container name `energy-postgres` already in use | Hay otra copia del proyecto levantada | `docker compose down` en la otra copia |

## 7. Apagar

```bash
docker compose down        # conserva los datos
docker compose down -v     # borra la base (el próximo arranque vuelve a sembrar las 5 viviendas)
```
