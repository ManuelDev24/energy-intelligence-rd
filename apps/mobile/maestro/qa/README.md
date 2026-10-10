# Flujos Maestro de QA de release (ERD-REL-VERIFY)

No forman parte del smoke piloto (`../pilot-flow.yaml` no cambia). Requieren la app ya con el onboarding
hecho (correr antes `../run-smoke.sh ios|android`) y Metro con `EXPO_PUBLIC_AUTH_ENABLED=false`.

| Flujo | Qué comprueba |
|---|---|
| `labels-flow.yaml` | En PILOT-01…05: PROYECTADO y ESTIMADO visibles, leyenda con REAL, "Resolución mensual: sin datos horarios", ningún texto en inglés ni horario |
| `api-down-flow.yaml` | **Con la API detenida** (`docker stop <contenedor-api>`): Inicio y Facturas muestran "Sin conexión" + Reintentar |
| `api-up-flow.yaml` | Tras volver a arrancar la API: Reintentar recupera el Inicio sin reiniciar la app |

```bash
maestro test -e APP_ID=host.exp.Exponent -e EXPO_URL=exp://127.0.0.1:8081 labels-flow.yaml      # iOS
maestro test -e APP_ID=host.exp.exponent -e EXPO_URL=exp://<IP-LAN>:8081 labels-flow.yaml        # Android
```
