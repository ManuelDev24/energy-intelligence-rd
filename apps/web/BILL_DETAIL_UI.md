# ERD-BILL-02 — UI web: detalle de cargos y revisión de consistencia

Cliente web de `services/api/BILL_DETAIL_VALIDATION.md`. Solo `apps/web/**`; usa el cliente compartido
(`getBillItems`, `putBillItems`, `assessBill`) y los contratos (`BillItemsOut`, `BillItemsReplace`,
`BillAssessment`) sin cambiarlos. Sin OCR ni aprobación.

## Pantalla `/bills/[id]`
Debajo de la tarjeta de la factura (no en modo edición de la factura):

### Detalle de cargos (`features/bills/BillItemsSection.tsx`)
- Lista los conceptos en el orden de `position`: concepto, tipo **en texto + ícono** (Cargo / Descuento) y monto.
- Resumen: **Total de la factura** (`bill_amount_dop`), **Total de ítems** y **Diferencia con el total de la
  factura**, tal como llegan de la API. `null` se muestra como **"Sin detalle"**, nunca `RD$ 0.00`. La web
  no suma ni recalcula nada; el total de la factura no cambia.
- **Editar detalle** → reemplazo completo: añadir, quitar, subir/bajar (botones con nombre accesible
  "Subir concepto N", etc.), cancelar. Guardar con la lista vacía deja la factura sin detalle.
- Validación local (`features/bills/items.ts`, espejo del PUT): concepto 1..200 sin quedar en blanco (se
  recorta), cargo ≥ 0, descuento ≤ 0, hasta 10 enteros y 2 decimales (admite `1,000.50`), máx. 100
  conceptos (el botón "Añadir concepto" se desactiva en 100). Se normaliza a texto `"120.50"`. Con
  errores no se llama a la API.
- Estados: cargando (skeleton), error local + Reintentar, vacío ("Aún no hay conceptos…"), guardado
  (`role="status"` "Detalle guardado."), error de guardado (`role="alert"`, mensaje local).

### Revisión de consistencia (`features/bills/BillAssessmentSection.tsx`)
- Texto fijo visible: **"Esta revisión no aprueba la factura."** Solo compara datos; no cambia nada.
- **Revisar consistencia** llama `POST /validate` (cuerpo `{}`) solo al pulsarlo; pulsarlo de nuevo vuelve a pedirla.
- Estado global con ícono + texto (Sin advertencias / Con advertencias / Incompleta: faltan datos).
- Comprobaciones: nombre en español + **ícono + texto** (Correcto / Advertencia / Sin datos suficientes), no solo color.
  Códigos desconocidos se muestran como "Comprobación adicional (código)".
- Advertencias traducidas por código (desconocidas: "Otra advertencia (código)").
- Procedencia: `creation` = **"Original registrado"** (+ fecha de registro); `migration`/`unknown` =
  **"Origen desconocido — dato anterior al registro de originales"**. Nunca se dice "verificado".
- Historial de correcciones: fecha/hora RD, entidad (Factura / Detalle de cargos) y campos cambiados
  "antes → después" (montos con formato RD$, listas como "N conceptos"). Aviso si `corrections_has_more`.

## Datos y caché (`lib/api/hooks.ts`)
- `keys.billItems(home, bill, account)` = `["homes", home, "bills", bill, "items", account]` y
  `keys.billAssessment(...)` = `[..., "assessment", account]`; `account` = id del usuario (auth) o `"pilot"`.
  Ambas cuelgan de `keys.bill(home, bill)`.
- `useBillItems`, `useBillAssessment(home, bill, requested)` (deshabilitada hasta pedirla), `usePutBillItems`
  (al terminar invalida `keys.bill(home, bill)`: factura, detalle y revisión de ESA factura; otras facturas,
  otras viviendas y tarifas quedan intactas; una revisión ya mostrada se vuelve a pedir).
- Cambio de cuenta: `SessionProvider` limpia la caché y `bffFetch` descarta respuestas tardías
  (`account_changed`), también para `/items` y `/validate` (probado con el transporte BFF real).

## BFF (`lib/auth/bff.ts`)
Allowlist nueva (sin consulta: cualquier parámetro → 400 antes de contactar la API):
| Método | Ruta | Cuerpo | Respuesta |
| --- | --- | --- | --- |
| GET | `/homes/<uuid>/bills/<uuid>/items` | — | `BillItemsOut` |
| PUT | `/homes/<uuid>/bills/<uuid>/items` | `{items:[{label,kind,amount_dop}]}` estricto (reglas de arriba; `amount_dop` texto) | `BillItemsOut` |
| POST | `/homes/<uuid>/bills/<uuid>/validate` | exactamente `{}` (`validated`, `approval` o cualquier campo → 422) | `BillAssessment` |

La respuesta se valida con el contrato y debe tener `home_id`/`bill_id` iguales a la ruta (también
`detail` dentro de la revisión); si no, 502. PATCH/DELETE/POST a `/items`, GET/PUT/DELETE a `/validate`,
subrutas, `/approve` o UUID inválidos → 404 sin contactar la API. Errores: solo texto local
(campos `label`, `kind`, `items`, `amount_dop` en la tabla de mensajes).

## Piloto (auth desactivada)
La API piloto puede no tener estos endpoints. Con auth desactivada, un 404/405/501 de `/items` o
`/validate` se muestra como aviso suave "no está disponible en este entorno" (sin error rojo, sin
editar ni revisar); la factura sigue visible. Con auth, un 404 es "No encontrado o sin acceso."
(`billDetailUnavailable` en `lib/api/errors.ts`).

## Pruebas (RED → GREEN)
- `src/lib/auth/bff-bill-detail.test.ts` (55): rutas permitidas, contrato/propiedad de la respuesta, variantes rechazadas sin upstream.
- `src/features/bills/items.test.ts` (17): validación local y edición de lista.
- `src/lib/api/bill-detail-errors.test.ts` (6): "no disponible" del piloto y mensajes locales.
- `src/test/bill-detail-cache.test.tsx` (4): claves, invalidación tras PUT, respuestas tardías tras cambio de cuenta.
- `src/test/bill-detail-page.test.tsx` (13): sección de detalle y revisión en la página.

```sh
fnm exec --using=24 npm test --workspace apps/web
cd apps/web && fnm exec --using=24 npm run typecheck && fnm exec --using=24 npm run lint
NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_AUTH_ENABLED=true API_BASE_URL=https://api.example.invalid \
  WEB_ORIGIN=https://app.example.invalid fnm exec --using=24 npm run build
```

## Límites
- Sin verificación en vivo contra la API ni captura visual (jsdom + transporte controlado únicamente).
- Los valores `observed` de cada comprobación no se muestran (solo nombre + estado).
- Reordenar es con botones Subir/Bajar (sin arrastrar). Al añadir un concepto el foco no se mueve solo.
- El listado de facturas no muestra el total de ítems (el contrato `BillOut` no lo trae).
