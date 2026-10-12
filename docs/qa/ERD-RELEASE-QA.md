# ERD-RELEASE-QA — recuperación de integración y aceptación verificable

## Alcance y ramas

El PR #20 aterrizó en `main` (`11141c1`), dejando `Dev` en `92d39f5`. Otros cuatro commits quedaron en `claude/elegant-ptolemy-sdr69r` (`fef74c8`). Se confirmó que el lote completo es descendiente de `Dev` y se integró por fast-forward en una **copia aislada**; hay 39 commits desde el `Dev` inicial hasta esa base.

Manuel autorizó la integración y publicación **exclusivamente a `Dev`**. La publicación y el CI remoto constituyen un gate separado de las verificaciones locales siguientes: consultar el `CI` del HEAD de `Dev` antes de aceptar integración. No se promueve a `QA`/`main`, no se despliega ni se gastan créditos. El checkout canónico con cambios ajenos y el piloto (`:8000`/`:5433`) se preservan.

## Evidencia independiente local — 2026-10-11

Base `fef74c83eeabeef2479bf92267200b132b317fa5`, con correcciones OCR y móviles acotadas. Evidencia sanitizada en [`evidence/dev-recovery-2026-10-11/`](evidence/dev-recovery-2026-10-11/).

| Gate | Resultado realmente ejecutado |
|---|---|
| API completa sobre PostgreSQL 16 aislado | **1,002 pasan, 0 fallan, 0 omitidas**, 202.3 s (`api-gates.json`) |
| Migraciones / seed / contratos | upgrade → downgrade una revisión → upgrade, seed dos veces y generación de contratos sin deriva: pasan |
| Arquitectura / configuración despliegue | pasan; checker de despliegue: 0 errores / 0 avisos |
| JS, Node 24.21.0 | **1,439 pasan**, 16 omisiones explícitas por variables de API: core 73, contratos 17, client 52, web 772, móvil 525 |
| Web contra API aislada real | **777 pasan, 0 omitidas** (no sumar otra vez a los totales unitarios) |
| Transporte móvil contra APIs aisladas | **10 pasan**, 1 omitida: sonda que exige el piloto antiguo y que CI también omite |
| Typecheck todos los workspaces / lint web | pasan |
| Build web producción | pasa con orígenes HTTPS de marcador; sin cambios web posteriores |
| Expo export iOS / Android tras corregir móvil | ambos pasan; no equivale a ejecutar Android |
| Maestro autenticado iOS | **dos recorridos completos consecutivos verdes**, 132.5 s / 135.0 s; siete capturas inspeccionadas; `native-ios-auth.json` |
| Tres facturas reales en pipeline de producción | **21/22 campos correctos**, 1 ausente, 0 incorrectos; `ocr-real-fields.json` |
| Original → cifrado → cola PostgreSQL → worker/Tesseract → borrador → confirmación → readback | **3/3 documentos reales**; no se creó factura antes de confirmar; `ocr-api-worker.json` |
| Secret scan de historia entrante y correcciones | Gitleaks 8.30.1: 3 detecciones verificadas no secretas (2 JWT sintéticos malformados para probar sanitización, 1 SHA256 que coincide con el flujo ejecutado); **0 secretos reales detectados**. Sin allowlist; `security-scan.json` |

El wrapper de prueba local resolvió la familia **DejaVuSans/DejaVuSans-Bold** exigida por los fixtures desde su instalación local porque macOS no tiene la ruta Linux de los mismos. No se usó Arial ni se cambiaron textos, diseños o expectativas. La primera ejecución bloqueó 18 pruebas por la ruta de fuente; al resolverla, la suite íntegra pasó. El CI Linux se comprueba aparte.

El recorrido de documentos reales usa **FastAPI TestClient en proceso**, base PostgreSQL real y almacenamiento local cifrado, no bucket cloud ni HTTP externo. La confirmación se automatizó con valores transcritos visualmente de forma independiente: **no certifica revisión humana ni UI móvil**. Facturas, datos originales, claves y trazas privadas no se versionan.

## Correcciones respaldadas por RED → GREEN

- OCR: filas no cruzan saltos de línea ni aceptan prefijos numéricos deformados; las variantes conservan evidencia por grupos coherentes. PDF conserva la selección, evidencia individual de cada página/variante y cambia una página por hipótesis, sin emparejar índices ni votar con páginas compartidas. Un primer match no oculta discrepancias en páginas posteriores, incluidas las capas de texto. `FACTURADO DE` mantiene prioridad semántica sobre saldos de `TOTAL A PAGAR`; se preserva el multiplicador validado de la tabla original. Discrepancias bajan confianza; repetición no convierte inferencias en `high`. Importe ambiguo: vacío y revisión manual. `passed` (seguridad) se distingue de `exact` (todos los campos correctos). Ambos hallazgos Required del primer review y el Optional tienen regresiones RED → GREEN.
- Móvil: importar únicamente `Platform` estáticamente evita que Metro enumere módulos nativos ausentes de React Native en Expo Go. Regresión con loader real de Metro y reproducción nativa.
- Maestro: confirmar el diálogo de cierre; regreso específico de plataforma; desplazar el botón de meta completamente a pantalla; seleccionar la tarjeta de vivienda mediante su `testID`.

La burbuja flotante de Expo Go se movió fuera del botón de perfil, sin borrar almacenamiento del simulador. Metro propio se detuvo tras las pruebas. Las verificaciones de código no certifican por sí solas todos los controles operativos del producto.

Las auditorías y simulaciones anteriores se documentan en `ERD-SIMULACIONES-2026-10-11.md` y `docs/RELEASE_CHECKLIST.md`; no se confunden con la verificación independiente nueva ni con servicios externos desplegados.

## Pendientes de aceptación del lote (no cerrar por integrar código)

- **ERD-OCR-REAL-QA:** 21/22 en muestras de ajuste; importe EDENORTE requiere introducción manual y faltan holdout de fotos reales/PDF auténtico.
- **ERD-E2E-MAESTRO-AUTH:** iOS dos corridas verdes; Android dos corridas pendientes. El correo real y su enlace quedan fuera del recorrido.
- **ERD-ONB-ACCEPTANCE:** recorrido normal iOS verificado; Android y escenarios de error/reanudación nativos pendientes.
- **ERD-BILL-LIVE-QA:** backend con tres originales reales verificado; falta recorrido móvil completo de subir, revisar/corregir, confirmar y consultar.
- **ERD-A11Y-NATIVE:** VoiceOver/TalkBack reales pendientes.
- **ERD-RELEASE-QA:** el gate de integración exige CI verde en `Dev`; promoción `Dev → QA` requiere decisión expresa de Manuel y resolver bloqueos.
- **ERD-LEGAL-FINAL:** responsable, canal ARCO, cifras de retención, textos definitivos y revisión legal pendientes. No inventar contacto ni publicar borradores como finales.
- **ERD-DEPLOY-01:** Render/Neon/bucket/Sentry/EAS reales requieren autorización, cuentas y despliegue en staging; no tocar producción.
- **ERD-OBS-01:** Sentry real, alertas, integración móvil y comprobación en staging pendientes.
- **ERD-OPS-DR:** PITR Neon, bucket externo, programación y restauración real pendientes.
- **ERD-SHARE-01:** compartir en dispositivo y correo real pendientes.
- **ERD-PROF-01:** lectura iOS comprobada; edición persistida, errores/reintentos y Android pendientes.
- **ERD-UI-KIT:** BottomSheet y DateRangePicker en dispositivo pendientes.
- **ERD-CHARTS-01:** se verificó el estado vacío, no todos los gráficos con datos en dispositivo.
- **ERD-STORE-01:** originales cifrados locales verificados; bucket real pendiente.
- **ERD-WORKER-01:** worker PostgreSQL real ejecutado localmente; ejecución en Render pendiente.
- **ERD-OCR-PROD:** pipeline y worker con documentos reales verificados; recorrido móvil y almacenamiento cloud pendientes.
- **ERD-ANOM-01-COMPLETE:** calibración/validación con consumo real pendiente.
- **ERD-ALERT-02:** push y correo en proveedores/dispositivos reales pendientes; Expo Go no certifica entrega push.

No se cierran estas tareas en el tablero únicamente por contar con commit y CI verde. La aceptación exige evidencia de cada requisito; la integración no es una liberación a producción.
