# Onboarding/perfil y abuso auth — gates del coordinador

2026-10-04, Dev. Entrega deleg_6a06b5dd. Sin commit/push ni publicación.

## Reejecución independiente
- Node24 `npm test`: core29, contratos7, cliente12, web240 aprobadas/5 omitidas, móvil279 aprobadas/11 omitidas.
- Typecheck completo, lint web y build producción auth/HTTPS placeholders: exit0; 19 páginas incluida `/profile`.
- API `.venv/bin/python tests/run_isolated.py -q --tb=short`: 364 passed, warning previo Starlette/httpx; DB dedicada `_test`, no piloto.
- Generador `.venv/bin/python -m scripts.generate_contracts --check`: exit0. El primer intento ejecutando script directamente falló import app; se corrigió el comando, no el producto.
- Arquitectura y `git diff --check`: exit0.
- Puertos8081/8011/8083/8084 comprobados sin listeners; no reinicio de servidores/emuladores.

## Alcance implementado
- Web: onboarding robustecido, `/profile` Mi cuenta/Mi vivienda/Mi servicio, PATCH parcial y GET confirmación, flags null/true/false, caché por cuenta/vivienda y respuestas tardías descartadas.
- Móvil: triestado corregido, Perfil desde encabezado de Inicio sin sexta pestaña, edición home/contract con readback, sin controles falsos para ajustes ausentes.
- API: limiter register/login/refresh persistente PostgreSQL atómico, HMAC peer/operación,429 Retry-After,503 fail-closed, migración0010 reversible, no proxy headers por defecto.

## No cerrado todavía
- Revisión deleg_c6d326f2 encontró cuatro Required R1–R4. Correcciones recibidas y revalidadas por coordinador: BFF Retry-After429 validado; móvil PATCH parcial, contrato clean/dirty y goal-progress invalidado. Harness componentes reales7/7; suite final web258/5omitidas, móvil286/11omitidas, shared29/7/12; typecheck/lint/build web/diff-check exit0. Ver informe revisión y mobile/docs/ERD_ONB_PROFILE_FIX_2026-10-04.md. No se declara QA nativo/live por estos gates.
- Live UI/BFF y QA visual/nativo de NUEVO onboarding/perfil no ejecutados en esta ronda. QA previo lecturas/consumo/metas no certifica estas pantallas nuevas.
- Sin idempotencia backend no se garantiza deduplicación absoluta de creación incierta.
- Rate limiting por peer agrega clientes NAT/BFF; despliegue y proxy trust requieren decisión. Registro duplicado409 aún permite enumeración, no auth pública terminada.
- Persisten recuperación/email, privacidad/borrado, notificaciones, dependencias, CI remoto y despliegue.
