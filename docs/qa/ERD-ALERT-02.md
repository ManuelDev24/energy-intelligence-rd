# ERD-ALERT-02 — Cuatro severidades, alertas de pago/anomalía/datos incompletos, push, correo y preferencias

Detalle técnico: `services/api/ALERTS.md`.

| Criterio | Evidencia |
|---|---|
| Cuatro severidades (`critical`, `warning`, `info`, `savings`) | check de base `ck_alerts_severity`; `test_a_notable_drop_is_a_savings_alert_and_never_notifies`; pantalla web ordena y rotula las cuatro |
| Alerta de pago (con fecha límite y estado pagado) | `test_alert_rules.py` (9); `test_payment_alert_*`, `test_severity_escalates_*`; navegador: alerta → correo → pagada → retirada |
| Alertas de anomalía enlazadas y con estado coherente | `test_a_fresh_anomaly_creates_a_linked_alert_and_states_stay_in_sync` y 3 más |
| Datos incompletos (informativos, nunca se envían) | `test_missing_bill_and_stale_readings_*`, `test_data_incomplete_alerts_never_notify_even_when_they_escalate` |
| Correo con preferencias, tope, sin cifras | `test_preferences_decide_who_gets_what`, `test_the_email_has_no_figures_*`, `test_the_daily_cap_*`; navegador: sin correo si está desactivado |
| Push: registro de dispositivo, envío, token muerto, caída del servicio | `test_register_device_*`, `test_push_*`, `test_expo_sender_*`, `notifications/push.test.ts` — **con dobles, no con un teléfono** |
| No avisar de lo viejo ni duplicar | `test_old_bills_entered_late_do_not_send_notifications`, `test_critical_after_warning_notifies_again_but_a_repeat_evaluation_does_not` |
| Datos personales (exportación, cascada) | `test_export_includes_anomalies_preferences_devices_and_notifications_but_never_the_push_token` |
| Migración ida y vuelta | `test_migration_roundtrip_and_downgrade_removes_new_alert_kinds` |

## Hallazgos durante el trabajo (corregidos)
1. Con el «datos incompletos» a nivel `warning` (dos ciclos sin factura) se enviaban correos: ahora solo avisan los tipos `bill_variation`, `anomaly` y `payment_due`.
2. El texto de preferencias (web y móvil) decía que **no se enviaba ningún aviso**: ya se envían (correo) y se actualizó, sin prometer el push en dispositivos.
3. `max_attempts` por tipo de trabajo y `fmtPeriod` de un solo día (de tareas anteriores) siguen cubiertos por sus pruebas.

## Pendiente y límites (honestidad)
- **Push sin verificar en un teléfono**: faltan EAS (credenciales FCM/APNs, `projectId`) y un build con `expo-notifications` (módulo nativo nuevo; reconstruir el development build). Sin eso la app responde «no disponible» y los avisos llegan por correo y en la app.
- **Proveedor de correo real** (Resend con dominio verificado): ERD-DEPLOY-01.
- **Facturas reales**: la fecha límite del OCR y los umbrales de las reglas están sin calibrar.
- Pagar y deshacer vuelve a avisar una vez (límite conocido).
- Texto legal: correo y push usan datos de la cuenta y un token del dispositivo; se añadió al borrador de privacidad, pendiente de revisión (ERD-LEGAL-FINAL).
