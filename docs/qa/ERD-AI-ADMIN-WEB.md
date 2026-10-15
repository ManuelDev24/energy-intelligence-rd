# ERD-AI-ADMIN-WEB — supervisión del Copilot (solo agregados)

Estado: **implementado y verificado** con pruebas de API (también como `erd_app`), unitarias de la consola y Playwright contra PostgreSQL + API + consola reales (24/24 en `apps/admin`, axe sin violaciones a 360/768/1280 px).

## Qué hay
- **Scope `admin.ai.read`** (migración 0040): super_admin y operations_admin. Soporte, auditor y revisor OCR no lo tienen.
- **`GET /api/v1/admin/ai/usage?days=` (1–90)**: respuestas por estado, tokens de entrada/salida, latencia p50/p95 (solo respuestas completas), valoraciones útil/no útil, conversaciones nuevas, por modelo, herramientas invocadas (nombres), uso por día (mensajes, tokens, personas), personas con más uso, límites vigentes y costo estimado.
- **Consola** `/ia`: cifras con tasas calculadas sin inventar (sin respuestas → «—»), tablas con barras decorativas ocultas a lectores de pantalla, enlace a la ficha de la persona solo si el identificador es real.

## Privacidad (decisión de diseño)
`copilot_messages` está bajo RLS; una función `SECURITY DEFINER` (`admin_copilot_stats`, search_path fijo) devuelve **únicamente agregados**. **Nunca**: texto de preguntas o respuestas, títulos de conversación, fuentes, vivienda ni correos. Las personas aparecen solo por su identificador (seudónimo; «pilot» en el modo sin cuentas). Cada consulta queda auditada (`ai.usage`, `scope_used=admin.ai.read`, ventana en días).

## Costo estimado
Se calcula solo si están configurados **ambos** precios (`COPILOT_PRICE_INPUT_USD_PER_MTOK` y `COPILOT_PRICE_OUTPUT_USD_PER_MTOK`, ver `docs/deploy/ENV_CHECKLIST.md`). Sin ellos la consola dice «Sin precios configurados» y no muestra ninguna cifra: un costo parcial o con precios supuestos engañaría. Es una estimación; no reemplaza la factura del proveedor.

## Qué NO hay (y por qué)
- **«Conversaciones marcadas»**: el producto no tiene ese concepto; no se simula.
- **Leer el contenido de una conversación**: requeriría un flujo de autorización (motivo, aprobación, aviso a la persona) y auditoría propios; es un paquete aparte con decisión legal/privacidad.
- Errores del proveedor en texto: solo se cuentan por estado; el texto crudo no se guarda ni se muestra.

## Evidencia
| Criterio | Prueba |
|---|---|
| 401 sin sesión; 403 para persona normal y soporte; `days` fuera de 1–90 → 422 | `test_admin_ai.py`, Playwright |
| Agregados: estados, tokens, p50/p95 solo de completas, valoraciones, modelos (incluye «desconocido»), herramientas, uso diario con ventana (el de hace 60 días queda fuera), personas | `test_admin_ai.py` |
| Sin datos: todo vacío o `null`, nada inventado | `test_ai_usage_with_no_data_is_empty_not_invented`, `ai.test.ts` |
| Costo solo con ambos precios; redondeo exacto | `test_cost_is_only_estimated_with_both_prices` |
| Ni texto de conversaciones, ni títulos, ni vivienda, ni correos en la respuesta | `test_admin_ai.py` (busca el contenido sembrado), Playwright |
| Solo lectura; el BFF solo deja pasar `GET /ai/usage?days=` | `bff.test.ts`, `test_admin_ai.py` |
| Auditoría | `test_admin_ai.py`, Playwright (`ai.usage`) |
| Accesibilidad | `a11y.spec.ts` incluye `/ia` a 360/768/1280 px |

## Pendiente de decisión
- Si se quiere inspeccionar conversaciones concretas (p. ej. por una queja), definir el flujo de autorización y el aviso a la persona antes de construirlo.
