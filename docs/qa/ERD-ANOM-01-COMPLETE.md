# ERD-ANOM-01-COMPLETE — Anomalías persistidas, confianza, picos, nocturno, caídas, job y deduplicación

Detalle técnico y reglas: `backend/api/ANOMALIES.md`.

| Criterio | Evidencia |
|---|---|
| Persistidas (no recalculadas en cada lectura) | tabla `anomalies` (0019); `test_a_reading_write_persists_a_peak_with_all_the_fields` |
| Confianza explícita | `confidence_for` + `test_confidence_points_are_explicit`; visible en web y móvil |
| Picos, aumentos, caídas, consumo nocturno | `test_anomaly_engine.py` (29) |
| Deduplicación y reescaneo idempotente | `test_rescanning_never_duplicates…`, clave única en la base (`test_the_database_rejects_inconsistent_rows`) |
| Estados y descarte que no reaparece | `test_acknowledge_dismiss_reopen_and_dismissed_never_returns`, `…resolved_and_reopens…` |
| Job y programador | `test_requesting_a_scan_queues_one_job_per_minute…`, `test_the_daily_job_scans_only_homes_with_recent_data…` |
| El escaneo nunca rompe una escritura | `test_a_failing_scan_does_not_lose…`, `test_a_database_error_inside_the_scan_rolls_back_only_the_scan` |
| Honestidad de datos (sin ceros inventados, sin interpolar, sin atribuir equipos) | pruebas del motor: huecos, cobertura, línea base mínima, ritmo por día cubierto |
| Aislamiento | `test_anomalies_are_isolated…`, `test_strangers_cannot_read_or_change_anomalies`, inventario de rutas |
| Web + móvil | `AnomalySection.test.tsx` (8), `bff-anomalies.test.ts` (10), `anomalies.test.ts` del cliente (5), `lib/anomaly.test.ts` móvil |
| Navegador real | `evidence/anom-complete-2026-10-10/web-anomalies.py` — 12/12 |

## Hallazgos durante el trabajo (corregidos)
1. **El BFF web no permitía `/anomalies`**: con sesión, la sección de desviaciones fallaba en silencio y mostraba «Sin desviaciones recientes». Ahora hay GET con filtros cerrados y PATCH de estado.
2. El texto anterior decía «kWh/día» sobre totales mensuales y comparaba meses de distinta longitud/cobertura; ahora se compara por ritmo.
3. `fmtPeriod` escribía un día suelto como «4–4 oct 2026»; ahora «4 oct 2026».

## Pendiente y límites
- **Calibración de umbrales con datos reales**: sin hacer. Hasta entonces, los hallazgos son pistas con su confianza, no diagnósticos.
- Notificar (push/correo) una anomalía nueva es ERD-ALERT-02 (el escaneo ya devuelve las creadas).
- «Patrones nuevos» y estacionalidad semanal: no implementados.
- Móvil sin probar en dispositivo.
