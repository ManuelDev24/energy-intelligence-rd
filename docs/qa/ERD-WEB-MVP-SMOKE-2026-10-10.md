# ERD-WEB-QUALITY — Smoke del MVP web

**Estado: PARCIAL; aceptación bloqueada por API real no disponible.**

Sesión iniciada el 2026-10-09 y finalizada el 2026-10-10, America/Santo_Domingo.
Rama solicitada: `test/web-mvp-smoke`, creada desde `upstream/Dev` en
`000abe0c7ef92f86dd049e70b9ac812918e3dade` (incluye merge del PR #16).
Node 24.21.0, npm 11.19.0, Python 3.12.14, Next.js 15.5.27, Windows.

## Checks ejecutados

| Comando | Resultado final | Evidencia / límites |
|---|---|---|
| `npm ci` | PASS, exit 0 | 971 paquetes añadidos, 978 auditados. Primero falló por EPERM de SWC: se detuvieron únicamente los dos procesos Next identificados del proyecto y se reintentó. Avisos de extracción ENOENT, deprecaciones y scripts no cubiertos por allowScripts; los checks posteriores pasan. |
| `npm run test --workspace apps/web -- --maxWorkers=2` | PASS, exit 0 | 47 archivos pasan, 1 omitido; 493 pruebas pasan, 5 omitidas; 64.21 s. Las 5 omitidas requieren LIVE_API_URL: no son evidencia de API real. |
| `npm run lint --workspace apps/web` | PASS, exit 0 | La primera invocación no encontró eslint durante la instalación; repetida una vez que los ejecutables estaban presentes, pasa sin errores. |
| `npm run typecheck --workspace apps/web` | PASS, exit 0 | La primera invocación no encontró tsc durante la instalación; repetida después, pasa (7.16 s). |
| `npm run build --workspace apps/web` | PASS, exit 0 | Compilación 34.1 s, tipos/lint, 22 páginas estáticas y trazas completadas. Primer intento restringido: spawn EPERM; reintento fuera del sandbox pasa. |
| API: `python -m pytest tests/test_api_dashboard.py -q -rs` | NO VERIFICADO | 10 pruebas omitidas por `PostgreSQL no disponible (OperationalError)`, 260.53 s. También hubo un aviso de permisos sobre .pytest_cache. Exit 0 con skips no significa backend aprobado. |

El build usa la configuración de compilación del CI:

```powershell
$env:NEXT_PUBLIC_AUTH_ENABLED='true'
$env:API_BASE_URL='https://api.example.invalid'
$env:WEB_ORIGIN='https://app.example.invalid'
npm run build --workspace apps/web
```

Esas URLs son marcadores de compilación, no una API real ni un despliegue.
El navegador se revisó en desarrollo/piloto, con AUTH false y API localhost:8000,
mediante `npm run dev --workspace apps/web -- --port 3001`.

## Rutas y features

La suite cubre dashboard, selector de período y cambio de vivienda, comparación,
proyección, alertas, facturas y detalle, consumo, lecturas, metas, equipos,
perfil, cuenta, onboarding, autenticación/recuperación, contratos y BFF.
Estas pruebas usan fixtures o transportes simulados salvo las cinco de integración
omitidas. La existencia de una ruta en el build no demuestra su flujo en navegador.

| Verificación en navegador | Resultado |
|---|---|
| `/login` | Página piloto con nombre de aplicación, vivienda y botón Entrar deshabilitado inicialmente; tras el fallo real de conexión muestra `No se pudo cargar / No se pudo conectar con la API`. |
| `/dashboard` sin vivienda | Intento de navegación agotó el tiempo del helper durante la redirección; el estado posterior confirma URL `/login` y su contenido. No se interpretó el timeout como fallo del producto. |
| `/register` en piloto | Muestra `El piloto local no admite cuentas` y enlace al piloto. |
| `/legal` en piloto | Muestra `No disponible en el piloto local` y enlace al registro. |
| Enlaces públicos por teclado | Activación con Enter de legal → registro → login, confirmada por contenido posterior. No equivale a completar todo el flujo con teclado. |
| Vivienda → crear factura → dashboard | **BLOQUEADO**: no hay API real disponible con viviendas; no se creó ni modificó una factura, no se sustituyó el backend por el simulador. |

La instancia de :3000 sirvió inicialmente HTML sin estilos. Se descartó como
evidencia de diseño y se abrió una instancia controlada en :3001, donde los estilos
sí cargaron. Sus capturas finales están en la carpeta de evidencia.

## Responsividad y accesibilidad

Medidas DOM de `/login` inicial: `scrollWidth` coincide con el ancho a
320, 375, 768 y 1280 px. En el estado final de error se volvió a medir
375 y 1280 px con el mismo resultado. Las capturas móviles/escritorio se
inspeccionaron; no se detectó desborde horizontal en esta página.
**No verificado:** reflow del dashboard, tablas, formularios y navegación interna
con datos, zoom 200%, hardware móvil y navegación completa por teclado.

El login tiene un main y un h1, sin tabindex positivo; el error usa role alert.
En código, Field enlaza label/input y aria-invalid/aria-describedby con los errores;
la gráfica incluye resumen accesible y tabla alternativa, con texto/patrón para
la proyección y soporte de reduced motion. No se ejecutó lector de pantalla,
axe/Lighthouse ni medición completa de contraste o de anillos de foco.
No se emite aprobación de accesibilidad para las pantallas no inspeccionadas.

| Principio | Severidad | Ubicación | Antes / estado actual | Después / acción propuesta | Por qué |
|---|---|---|---|---|---|
| Evitar bloques repetidos | MEDIUM | `apps/web/src/components/app-shell.tsx:117` | Sin enlace Saltar al contenido antes de la navegación. | Añadir enlace al main con foco visible. | Los usuarios de teclado deben atravesar la navegación para llegar al contenido. |
| Orientación ante errores | MEDIUM | `apps/web/src/features/bills/BillForm.tsx:45` | Al validar solo actualiza errores; no mueve el foco. | Llevar foco al primer campo inválido o al resumen de errores. | Facilita localizar y corregir el error con teclado/lector. |
| Identificar la página | LOW | `apps/web/src/app/layout.tsx:8` | Título raíz Energy RD reutilizado en las rutas revisadas. Reset de contraseña tiene título propio. | Definir título por pantalla. | Mejora orientación y selección de pestañas. |

Hallazgo funcional adicional: PilotLogin muestra el error de viviendas sin pasar
onRetry a QueryState. No aparece Reintentar en ese estado; la recuperación requiere
recargar la página. Observado en navegador y confirmado en
`apps/web/src/components/pilot-login.tsx`.
No se cambiaron componentes en una tarea de revisión.

## Calidad de datos y dependencias

`apps/web/src/lib/api/index.ts` usa createLiveApi directa o BFF y no hace fallback a
mocks. En el navegador sin backend apareció el error, no viviendas ni métricas
inventadas. La verificación de valores/etiquetas contra respuestas reales permanece
pendiente. El porcentaje de Hero calculado con projectionDeltaPct en cliente,
sin etiqueta propia, sigue como observación H1 del informe histórico ERD-WEB-QUALITY.

npm ci reportó 23 vulnerabilidades (2 moderate, 21 high). No se aplicó npm audit fix
ni se actualizaron dependencias; el impacto individual no se auditó en esta sesión.

## Evidencia y desbloqueo

Carpeta: `docs/qa/evidence/web-mvp-smoke-2026-10-10/`.

- `login-api-error-375.jpg`: error de API en móvil, estilos cargados.
- `login-api-error-1280.jpg`: mismo error en escritorio.
- `responsive.json`: medidas de viewport y scrollWidth.
- `login-375.jpg` y `login-1280.jpg`: estado inicial antes de completar el error.

Se solicitó una URL de API real de pruebas; no se recibió durante esta ejecución.
localhost:8000 no tenía API escuchando. PostgreSQL configurado en localhost:5433
no estuvo disponible; Docker no aparece en PATH ni en su ruta habitual.
Python sí existe en services/api/.venv y se usó para la sonda del backend.
No se reconfiguraron remotos, no se creó PR ni se publicó en Dev/QA/main.
El informe anterior de POSTMERGE sigue separado y no pertenece a este commit.

Para cerrar la aceptación se requiere PostgreSQL/API reales accesibles y migrados,
con datos de pruebas. Con esa API:

1. Ejecutar la suite web con LIVE_API_URL y exigir cero skips de integración.
2. Abrir la web conectada a esa API; seleccionar vivienda, registrar factura manual
   con período no solapado, guardar y confirmar en dashboard el id/valores enviados
   por el backend; volver a cargar y comprobar persistencia.
3. Revisar cambios de vivienda/período, alertas, comparación, proyección, carga/error/vacío,
   y las rutas restantes; repetir a 320/375/768/1280 px y con teclado.
4. Ejecutar audit automático, lector de pantalla y contraste; guardar capturas y
   resultados en esta carpeta. Mantener la etiqueta de demo si se usa seed real.

**Cierre: checks de herramientas PASS; flujo completo sin mocks NO VERIFICADO.
No aceptar ERD-WEB-QUALITY como completo con esta evidencia.**
