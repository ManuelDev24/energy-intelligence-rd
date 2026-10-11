# ERD-DEV-02 — Equipos con tipo, marca, modelo, icono y % de consumo calculado por el servidor

| Criterio | Evidencia |
|---|---|
| Tipo de equipo (catálogo cerrado de 11) validado en el formulario, en la API y en la base | `ck_equipment_kind`; `test_invalid_details_are_422`; `test_database_rejects_values_outside_the_catalog`; `validateEquipment` (core) |
| Marca y modelo opcionales (≤ 60), en blanco = `null` | `test_details_are_saved_trimmed_and_updated`; `validation.test.ts` |
| Icono elegido o, por defecto, el del tipo | `equipmentIcon` (core, `equipmentCatalog.test.ts`); `deviceCardView` (móvil); selector accesible (`radiogroup`) |
| Catálogo idéntico en API, core, web y móvil | `EQUIPMENT_KINDS/ICONS` (API) = `equipmentCatalog.ts` (core) = contrato generado: `device-card.test.tsx › catálogo vs contrato`; iconos de Ionicons verificados contra el glyphmap (`deviceCard.test.ts`) |
| % por equipo **calculado en el servidor**, suma exacta 100,00 | `shares_pct` (mayor resto) + `test_share_is_computed_server_side_and_sums_to_100`, `test_shares_pct_properties`; el desglose web y móvil dejaron de recalcularlo (`share_pct`) |
| El % se etiqueta ESTIMADO y no se confunde con la factura | `Metric(quality="ESTIMATED", unit="%")`; la nota del estimado lo aclara (`test_estimate_note_says_the_share_is_not_of_the_bill`) |
| Equipos existentes no se rompen ni se «adivinan» | migración 0021: `kind='other'`, sin marca/modelo/icono; `test_0021_existing_equipment_becomes_other_*` (ida y vuelta) |
| `DeviceCard` en web y móvil | `components/device-card.tsx`, `components/DeviceCard.tsx`; `device-card.test.tsx`, `deviceCard.test.ts` |
| BFF estricto con los campos nuevos | `bff-equipment.test.ts` (tipo/icono/marca inválidos y campos extra no llegan a la API; respuesta con tipo desconocido → 502) |
| Navegador (API real + web real) | `docs/qa/evidence/dev-02-2026-10-11/web-devices.py`: 10/10 (alta con tipo/marca/modelo, % del servidor = % en pantalla y suman 100,00, edición, BFF rechaza inválidos, sin desborde a 375 px) |

## Decisiones
- La web pasó de **tabla a tarjetas** (así lo prevé `docs/architecture/UI_KIT.md`); el gráfico «¿Qué equipo consume más?» se conserva y ahora usa el % de la API (redondeado a entero en la barra; la tarjeta muestra los 2 decimales del servidor).
- El % es la parte de cada equipo **dentro del total estimado de los equipos declarados**, no de la factura (eso ya lo dice «Explican de la factura»).
- Icono: `null` = el del tipo. Se guarda solo si la persona lo elige.

## Pendiente y límites (honestidad)
- La app móvil se verificó con TypeScript, pruebas de lógica/estructura y exportación de Metro, **no en un teléfono ni simulador** (no hay).
- Marca y modelo son texto libre: no hay catálogo de marcas ni se usa para estimar potencia; no se infiere nada de ellos.
- Iconos de Ionicons son aproximaciones (no existe icono de nevera/lavadora/abanico exactos); la web usa lucide.
- Texto legal: marca/modelo son datos de la vivienda; añadidos a la categoría «Equipos» del borrador de privacidad.
