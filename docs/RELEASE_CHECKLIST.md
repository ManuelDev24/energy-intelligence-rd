# Checklist de release — Energy RD (piloto)

Se usa antes de mover **Dev → main** (y antes de una demo con usuarios piloto).
Responsable del release: Manuel. Marcar cada casilla; si una falla, el release se detiene.

Release: `________`  ·  Commit de Dev: `________`  ·  Fecha: `________`  ·  Quién verificó: `________`

## 1. Código y ramas

- [ ] Todas las tareas del release están mergeadas en `Dev` (`git log origin/main..origin/Dev --oneline`).
- [ ] Cada commit/PR lleva su ID `[ERD-XXX-NN]`.
- [ ] No hay PRs abiertos hacia `Dev` que deban entrar en este release.
- [ ] `git status` limpio en la copia usada para verificar (sin cambios locales).

## 2. CI (GitHub Actions) en el commit de `Dev`

- [ ] `api (pytest + migrations)` ✅
- [ ] `web + mobile (typecheck, lint, test, build)` ✅
- [ ] `mobile e2e (recorrido piloto vs API real)` ✅

```bash
gh run list -R ManuelDev24/energy-intelligence-rd --branch Dev --limit 1
```

## 3. Base de datos y migraciones

- [ ] Desde base vacía: `alembic upgrade head` OK.
- [ ] `alembic downgrade -1` y de nuevo `upgrade head` OK (lo cubre `test_migrations.py`).
- [ ] Migraciones nuevas revisadas: reversibles y sin pérdida de datos existentes.
- [ ] Seed idempotente: ejecutarlo dos veces no duplica viviendas, facturas ni equipos.

## 4. Levantar desde cero (clon limpio)

Seguir `docs/DEMO_GUIDE.md` §2 en un directorio nuevo, **sin** reutilizar `node_modules` ni volúmenes:

- [ ] `docker compose up -d --build --wait postgres api` → ambos *healthy*.
- [ ] `GET /health` → `{"status":"healthy","database":"ok"}`.
- [ ] `GET /api/v1/homes` → exactamente 5 viviendas PILOT-01…05.
- [ ] `GET /docs` (OpenAPI) carga.
- [ ] `npm ci` sin errores.
- [ ] Web en `:3000` muestra *Acceso demo* con las 5 viviendas.
- [ ] Móvil: Metro empaqueta y la app abre en Expo Go / simulador.

## 5. Funcionalidad (guion de demo §4)

- [ ] Las 5 viviendas muestran los valores de la tabla de `docs/DEMO_GUIDE.md` §3.
- [ ] Cada número tiene etiqueta REAL / ESTIMADO / PROYECTADO; no hay métricas horarias.
- [ ] Factura inválida (kWh/monto/días negativos, período invertido, solapado) → rechazada con mensaje claro.
- [ ] Factura válida → aparece en el historial y actualiza dashboard y proyección.
- [ ] Alerta por variación: se crea, se marca como leída y se descarta.
- [ ] Equipos: crear, editar, eliminar; el total se recalcula y queda como ESTIMADO.
- [ ] Estados de carga, error (con *Reintentar*) y vacío visibles al apagar la API.
- [ ] Smoke test móvil (Maestro) en Android y/o iOS pasa — `docs/qa/ERD-MOB-QUALITY.md`.
- [ ] Verificación web (ERD-WEB-QUALITY) pasa.

## 6. Seguridad y datos

- [ ] Sin secretos en el repo (`.env` no versionado; `.env.example` solo con placeholders `change_me_local_only`).
- [ ] `CORS_ORIGINS` explícito, nunca `*`.
- [ ] Los datos demo están marcados como demo (`source=seed`, aviso en dashboard).
- [ ] Ningún log/captura incluye datos personales reales.

## 7. Publicar

- [ ] PR `Dev → main` creado con resumen de tareas incluidas y enlace a esta checklist.
- [ ] CI del PR en verde; merge aprobado por Manuel.
- [ ] Tag del release (opcional): `git tag pilot-YYYY-MM-DD && git push origin pilot-YYYY-MM-DD`.
- [ ] `QA` actualizado si se usa como entorno de prueba.
- [ ] Mensaje al grupo con el enlace del release.

## 8. Rollback

- Código: revertir el merge en `main` (`git revert -m 1 <merge-sha>`), nuevo PR.
- Base de datos: `alembic downgrade <revisión-anterior>` **antes** de desplegar el código anterior.
- Demo local: `docker compose down -v && docker compose up -d --build --wait postgres api` restaura el seed.
