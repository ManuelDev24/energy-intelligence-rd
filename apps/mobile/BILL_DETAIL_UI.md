# ERD-BILL-02 — UI móvil: detalle de factura, ítems y revisión de consistencia

Backend y cliente compartido: `services/api/BILL_DETAIL_VALIDATION.md` (`getBillItems`, `putBillItems`, `assessBill`
en `packages/api-client`). Sin OCR, sin aprobación, sin tarifas ni conceptos inventados.

## Pantallas y navegación

| Pantalla | Archivo | testIDs |
|---|---|---|
| **Acceso desde Facturas** | `features/bills/BillsScreen.tsx` (acción “Ver detalle” en la fila de cada factura) | `bill-open-<inicio>` (nuevo; `bill-<inicio>`, `add-bill` y la acción “Eliminar” no cambian) |
| **Detalle de factura** (pila `BillDetail`, título “Detalle de factura”) | `features/bills/detail/BillDetailScreen.tsx` | `bill-detail`, `bill-detail-items`, `bill-detail-item-<pos>`, `bill-detail-empty`, `bill-detail-items-total`, `bill-detail-bill-total`, `bill-detail-difference`, `bill-detail-saved`, `bill-detail-edit`, `bill-detail-assess`, `bill-detail-unavailable`, `bill-detail-other-home` |
| **Revisión** (dentro del detalle) | ídem, componente `Assessment` | `assessment-result`, `assessment-approval-note`, `assessment-status`, `assessment-check-<i>`, `assessment-warnings`, `assessment-provenance`, `assessment-correction-<i>`, `assessment-corrections-note`, `assessment-unavailable` |
| **Editar ítems** (pila `BillItemsEditor`) | `features/bills/detail/BillItemsEditorScreen.tsx` | `item-<i>`, `item-label-<i>`, `item-kind-<i>-charge/discount`, `item-amount-<i>`, `<campo>-error`, `item-remove-<i>`, `items-add`, `items-save`, `items-empty`, `items-list-error`, `items-server-error`, `items-unavailable`, `items-other-home`, `keyboard-done` |

Las rutas llevan `homeId` + `billId`; si el usuario cambia la vivienda activa, la pantalla muestra “Factura de otra
vivienda” y no consulta ni guarda nada (`belongsToSelectedHome`).

## Comportamiento

- **Detalle:** lista de cargos/descuentos (concepto, tipo en texto, monto con signo), **Total de ítems** y **Total de la
  factura**, y la diferencia con icono + texto + tono: “Los ítems cuadran…”, “Los ítems suman RD$ X más/menos que el total
  de la factura.”. Sin ítems ⇒ total y diferencia **“Sin detalle”** (la API envía `null`; nunca se muestra 0). El total de
  la factura **no se recalcula** a partir de los ítems (se indica en pantalla).
- **Editor:** añadir/quitar ítems (máx. 100; el botón se desactiva y el contador lo indica), tipo **Cargo/Descuento**
  (segmentado), monto **sin signo** (el tipo define el signo: descuento ⇒ se envía negativo; cero nunca como `-0.00`).
  Parseo de miles igual que el resto de la app (`normalizeDecimal` de lecturas: `1,000` = mil, `1250,5` = decimal).
  Validación idéntica a `BillItemIn`: concepto 1–200 puntos de código, no solo espacios, sin NUL (se envía recortado);
  Decimal(12,2) ⇒ ≤ 10 enteros, ≤ 2 decimales; lista ≤ 100. Guardar sin ítems borra el detalle.
- **Guardado verificado:** `PUT /items` → `GET /items` → comparar con lo enviado (orden por `position`, concepto, tipo y
  monto en centavos exactos) → solo entonces se publica en caché y se vuelve al detalle con “Detalle guardado y
  confirmado.”. Cuenta (época) y vivienda se re-verifican antes y **después de cada await**; si cambiaron, no se publica
  nada ni se muestra error en la pantalla equivocada. Relectura distinta ⇒ “No se pudo confirmar el guardado…”.
- **Revisar consistencia:** `POST /validate` (solo lectura) bajo demanda. Muestra siempre **“Esta revisión no aprueba la
  factura.”**, estado general (icono + texto), comprobaciones (`period_order`, `period_duration`, `days_consistency`,
  `readings_kwh`, `items_sum`) con icono + “Correcto/Advertencia/Sin datos” + detalle redactado localmente desde valores
  validados de `observed`; códigos desconocidos ⇒ “Comprobación adicional”. Advertencias redactadas localmente (sin
  duplicados). Procedencia: `creation` ⇒ **“Original registrado”** (con fecha de registro); `migration`/`unknown` ⇒
  **“Origen desconocido — dato anterior al registro de originales”**. Nunca se usa “verificado” (probado).
  Correcciones: título, fecha/hora RD y **antes → después**; de la factura solo campos conocidos (período, días, kWh,
  monto, lecturas), de los ítems el número de ítems y su total. Sin correcciones / recorte a 100 se indica.

## Datos y caché

- Claves (`features/bills/detail/keys.ts`, probado): `[...alcance, 'bill-items', home, bill]` y
  `[...alcance, 'bill-assessment', home, bill]`, con alcance `['account', época]` o `['pilot']`. El `queryClient.clear()`
  del cierre de sesión (`auth/runtime.ts`) y el cambio de época las eliminan (mecanismo existente).
- Tras guardar: `setQueryData` del detalle releído + invalidación de detalle **y** revisión de **esa** factura.
- 4xx no se reintenta (`retryPolicy`).

## API piloto / fallo suave

La API piloto (`:8000`, imagen antigua) responde 404 en estas rutas. `detailScreenState` trata 404/405/501 como **no
disponible**: aviso compacto “El detalle de factura no está disponible en este servidor.” y se **ocultan** “Editar
ítems” y “Revisar consistencia”. Red/5xx/contrato ⇒ error con “Reintentar”. Un 404 también puede significar factura
inexistente o ajena (la API los hace indistinguibles); la UI no lo distingue. Textos de error siempre locales
(`describeError`), nunca del servidor. `maestro/pilot-flow.yaml` y `maestro/phase2-flow.yaml` no cambian (hash igual).

## Archivos

- Lógica pura con pruebas: `features/bills/detail/{keys,itemsForm,detailModel,saveItems,assessmentModel,screenState}.ts`
  (+ `*.test.ts`).
- UI/cableado: `features/bills/detail/{hooks.ts,BillDetailScreen.tsx,BillItemsEditorScreen.tsx}`,
  `features/bills/BillsScreen.tsx` (prop opcional `onOpen`), `navigation/AppNavigator.tsx` (rutas `BillDetail`,
  `BillItemsEditor`).

## Verificación

```bash
eval "$(fnm env --shell bash)"
fnm exec --using=24 npm test --workspace apps/mobile        # 324 passed | 11 skipped (antes 286 | 11)
fnm exec --using=24 npm run typecheck --workspace apps/mobile
npx expo export --platform ios|android --output-dir ~/.hermes/cache/scratch/erd-bill-02-mobile-export/<plataforma>
shasum -a 256 maestro/pilot-flow.yaml maestro/phase2-flow.yaml   # sin cambios
```

## Límites

- **Sin QA nativa** (simulador/emulador/dispositivo) ni Maestro de este flujo; sin prueba HTTP en vivo desde el móvil
  (servicios apagados). La compilación se probó con `expo export`, que no certifica el layout ni el teclado.
- Las pantallas no tienen pruebas de render (vitest solo lógica pura con RN simulado).
- Sin OCR, sin aprobación, sin reordenar ítems (el orden es el de la lista), sin edición del total de la factura.
- El aviso de guardado confirmado queda en el detalle hasta salir de la pantalla.
