# Simulaciones con datos mock (2026-10-11) — qué cubren y qué NO cierran

Pedido: «terminar con datos mock» las tareas que dependen de cuentas, dispositivos, facturas reales o personas. Un mock **ejercita el código**
y atrapa fallos reales (abajo hay tres), pero **no sustituye** el criterio real de cada tarea. Ninguna de estas tareas se da por cerrada.

| Tarea | Qué se simuló | Evidencia | Lo que el criterio real sigue pidiendo |
|---|---|---|---|
| 1 OCR facturas reales | Facturas **sintéticas** con las etiquetas y la estructura de las 3 distribuidoras (fondos azul y amarillo, tablas, talón de pago), limpias y degradadas como foto de celular, leídas con Tesseract **real** | `tests/synthetic_bills.py`, `tests/test_ocr_synthetic_layouts.py` (7); evaluación de 18 lecturas: **109 campos bien, 15 sin leer, 8 mal pero avisados, 0 mal con confianza alta** | Facturas reales **nuevas** (foto de celular y PDF del portal) |
| 10 Despliegue | **Simulacro local**: API + worker + bucket S3 (servidor `moto`, con versionado) + PostgreSQL; foto → 202 → OCR en el worker → borrador → confirmar con el original → alerta de pago → correo sin cifras → cola sana | `infrastructure/sim/staging_sim.py`; `docs/qa/evidence/sim-staging-2026-10-11/results.json` (**17/17**) | Cuentas reales de Neon, Render, bucket, Resend, EAS, dominio y TLS |
| 12 Recuperación | Mismo simulacro: objeto **cifrado** en el bucket, pérdida simulada → `storage_reconcile` sale 1 y nombra el documento → recuperar la versión → sale 0; borrar el documento vacía el bucket. Además `scripts/test_db_dr.sh` (**10/10**: respaldo cifrado, restauración verificada, 6 fallos detectados) | ídem; salida de `test_db_dr.sh` | PITR en Neon, versionado del bucket real, programación diaria y un simulacro con datos reales |
| 11 Observabilidad | Servidor local que hace de Sentry; navegador real; error con correo y token | `docs/qa/evidence/obs-web-2026-10-11/` (7/7 con DSN, 1/1 sin DSN) | Proyecto y DSN reales, alertas, SDK móvil |
| 7 Legal | **Borradores** completos de términos y política de privacidad, en español, con cada afirmación atada a lo que el código hace | `docs/legal/TERMS_OF_SERVICE_DRAFT.md`, `docs/legal/PRIVACY_POLICY_DRAFT.md` | **Revisión y aprobación de un abogado**; sin eso el estado legal sigue en `draft` |
| 2 Maestro / 5 Accesibilidad | **No hay simulación posible**: sin KVM no corre un emulador Android y iOS no existe en Linux. Ya estaban las pruebas estáticas (ids contra el código, roles, contraste, áreas táctiles) | `maestroFlows.test.ts`, `a11yStatic.test.ts` | Maestro en iOS y Android; VoiceOver y TalkBack en un teléfono |
| 6 Release QA | Réplica local del CI + ahora las pruebas nuevas | `docs/qa/ERD-RELEASE-QA.md` | CI de GitHub en verde sobre estos commits y la decisión de promover (Manuel) |

## Fallos reales que las simulaciones encontraron (corregidos)
1. **Un dígito mal leído salía con confianza alta**: en una factura sintética de EDENORTE el monto `199.41` salió `199.42` como «alta». La
   verificación cruzada (suma del cargo fijo y la energía impresos) aceptaba 1 centavo de diferencia; ahora exige igualdad exacta, y un monto
   que se lee **una sola vez** ya no es «alta» (solo lo es si la suma de los conceptos lo confirma o dos lecturas coinciden).
2. **«días» leído como «diaz»** rompía la detección del período en facturas por lo demás limpias; ahora se tolera (`diaz`, `dias`, `d1as`…).
3. **`R0S`/`ROS` por `RD$`** impedía sumar los escalones de energía; ahora se tolera.

## Cómo se repite
```bash
service postgresql start
(cd /tmp && uvx --from 'moto[server]' moto_server -p 5555 &)                    # bucket S3 de mentira
cd backend/api && uv run python ../../infrastructure/sim/staging_sim.py ../../docs/qa/evidence/sim-staging-2026-10-11
ADMIN_URL=postgresql://energy:change_me_local_only@localhost:5432/postgres scripts/test_db_dr.sh
uv run pytest tests/test_ocr_synthetic_layouts.py
```

## Límites — leer antes de citar estos números
- Las facturas sintéticas reproducen lo que **ya vimos** en 3 facturas reales; no pueden revelar lo que no hemos visto. Su degradación («foto»)
  es una aproximación; una foto real de celular puede ser mejor o peor.
- `moto` no es R2/S3: no prueba permisos reales, latencia, costos, políticas de ciclo de vida ni la consistencia de un proveedor.
- El correo del simulacro va a un archivo de desarrollo, no a Resend; el push no se envió a ningún teléfono.
- Nada de esto prueba Render, Neon, EAS, DNS ni TLS.
