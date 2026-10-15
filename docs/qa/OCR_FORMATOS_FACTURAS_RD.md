# Formato de las facturas eléctricas de RD (EDESUR, EDENORTE, EDEESTE) — base del parser OCR

- Investigación: 2026-10-10 (Manuel, ERD-REL-VERIFY). Fuentes públicas en internet; **ninguna foto real de
  factura entra al repo**. Las facturas de terceros publicadas en Scribd/Studocu se usaron **solo** para leer
  etiquetas y formatos; no se copió ningún nombre, dirección, NIC, contrato ni monto.
- Parser: `backend/api/app/services/ocr/parser.py`. Pruebas: `backend/api/tests/test_ocr_parser_rd_layouts.py`.

## Base legal común (las tres distribuidoras)
Reglamento de Aplicación de la Ley General de Electricidad 125-01 (Decreto 555-02): la factura debe indicar,
entre otros, el **número de días facturados**, el voltaje de servicio, la **lectura actual y la anterior con sus
fechas**, si la facturación es **promediada o por lectura**, la fianza y un cuadro de **histórico de consumo**.
Por eso el diseño es casi igual en las tres.
- https://eted.gob.do/cce/download/13/marco-normativo/1818/reglamento-ley_-no_-125-01.pdf
- https://sie.gob.do/wp-content/uploads/2021/05/Decreto_No._555-02_RLGE_-_Gaceta_Oficial.pdf

## Etiquetas y formatos observados

| Campo | Cómo aparece | Distribuidoras |
|---|---|---|
| Período | Encabezado `PERIODO DE FACTURACION` (fila *DATOS DEL CONTRATO*); el valor va en la fila de abajo junto a tarifa/voltaje/potencia: `17/04/2023 - 16/05/2023 = 29 días` | EDESUR, EDEESTE (`= 30 Días`), EDENORTE |
| Días facturados | Dentro de la línea del período (`= N días`); son días **transcurridos** (17/04→16/05 = 29). EDEESTE lo repite en `Cargo Fijo 30 dias` | las tres |
| Lecturas | Tabla: `LECTURA ANTERIOR  LECTURA ACTUAL  MULTIPLO  CONSUMO` con los valores en la línea siguiente; EDENORTE antepone `TIPO DE LECTURA  NO DE CONTADOR` y puede decir `CONSUMO PROMEDIADO` | EDESUR, EDENORTE |
| Consumo (kWh) | Columna `CONSUMO` de la tabla, o líneas de energía `N kWh X RD$ tarifa` (una por escalón tarifario) | las tres |
| Cargo fijo | `Cargo Fijo 30 dias, RD$ 137.25` | EDEESTE (no confirmado literal en EDESUR/EDENORTE) |
| Fechas de control | `FECHA DE EMISION:`, `FECHA LIMITE DE PAGO :` (con espacios irregulares: `16 /05 /2023`) | EDESUR |
| Identificación | `NIC`, `NIS`, `Medidor`, `REF.`, `CONTRATO :` | EDESUR/EDEESTE (NIC), EDENORTE (contrato) |
| Montos | `RD$` + coma de miles + punto decimal: `RD$ 2,834.46` | las tres |
| Histórico | Meses de 3 letras: `Jul Ago Sep … Jun` | EDENORTE (EDEESTE: últimos 3 meses en barras) |

Fuentes: EDEESTE "¿Cómo leer su factura?" https://edeeste.com.do/index.php/inicio/aprende-con-edeeste/como-leer-su-factura/ ·
EDESUR preguntas frecuentes (NIC) https://www.edesur.com.do/empresa/preguntas-frecuentes/ ·
facturas de terceros (solo formato): https://www.scribd.com/document/652969503/Factura-7023638-16-05-2023-1 (EDESUR),
https://www.scribd.com/document/717805559/630477241-Edenorte-factura (EDENORTE),
https://www.scribd.com/document/529246938/Factura-Edeeste-convertido-2 (EDEESTE, vía resumen del buscador).
Investigación cruzada con Codex/Claude (`hermes chat`), mismas fuentes.

**No verificado:** la etiqueta literal del total en EDESUR y EDENORTE (el parser busca `TOTAL A PAGAR`); no hay
una factura de ejemplo oficial y anonimizada publicada por ninguna distribuidora ni por la SIE.

## Qué hace el parser con esto
1. Período: primero la línea `fecha - fecha = N días` en cualquier parte del texto (la etiqueta puede estar en
   otra línea); si no, `Periodo [de facturación|consumo|lectura][:] [del] fecha al|-  fecha`. Nunca toma
   `FECHA DE EMISION` ni `FECHA LIMITE DE PAGO` como período.
2. Días: los impresos (`= N días` o `(N días)`) con confianza alta; si no cuadran con las fechas leídas
   (ni N = transcurridos ni N = transcurridos + 1), período en confianza `inferred` y aviso.
3. Lecturas: etiqueta en línea (`Lectura anterior: …`) o la tabla; si `(actual − anterior) × múltiplo` no da el
   consumo impreso, no se usan y se avisa.
4. kWh: etiqueta `Consumo … kWh` o columna CONSUMO (alta); si no, suma de líneas `N kWh X RD$` (`inferred`).
5. Ruido real de Tesseract tolerado: `RD$`→`RDS`, `=`→`>`, `-`→`=`/`>`, `:` pegado a las fechas, `TOTAL/A PAGAR`.

## Prueba con Tesseract real (5.5, `spa+eng`)
Imágenes sintéticas con el diseño de cada distribuidora (etiquetas reales, datos inventados), limpia y como
"foto" degradada (giro 1.2°, desenfoque, ruido, JPEG 70). Script: `scratch/billresearch/ocr_layouts_probe.py`.

| Imagen | Período | Días | kWh | Total | Resultado |
|---|---|---|---|---|---|
| EDESUR limpia | ✅ | ✅ 29 | ✅ 310 (tabla) | ✅ | 5/5 |
| EDESUR foto | ✅ | ✅ | ⚠️ tabla ilegible → vacío + aviso | ✅ | 4/5, sin inventar |
| EDEESTE limpia | ✅ | ✅ 30 | ✅ 261 (escalones, `inferred`) | ✅ | 5/5 |
| EDEESTE foto | ⚠️ leyó 18/12 por 14/12 → `inferred` + aviso de días | ✅ | ✅ | ✅ | error detectado |
| EDENORTE limpia | ✅ | ✅ 29 | ✅ 320 (tabla) | ✅ | 5/5 |
| EDENORTE foto | ✅ | ✅ | ✅ (`inferred`) | ✅ | 5/5 |

**Pendiente:** confirmar con fotos reales de las tres distribuidoras (datos personales tapados). Esto cubre el
formato documentado, no la calidad de una foto real de celular.

---

## Hallazgos 2026-10-11 (ERD-OCR-REAL-QA, **sin** facturas reales ni PDF)

Se intentó obtener un duplicado real desde el portal de EDESUR (`ov.edesur.com.do/duplicado-facturas`). **No se pudo**: la red del
entorno de trabajo bloquea ese dominio (el proxy rechaza la conexión y `getaddrinfo` no lo resuelve). No se llegó a iniciar sesión,
no se guardó ninguna credencial y **no hay ninguna factura real, PDF ni captura** en el repositorio ni en `qa-private/`.
(Las credenciales de una cuenta quedaron pegadas en la conversación: conviene cambiar esa contraseña.)

### Qué se investigó y qué se encontró
| Tema | Hallazgo | Fuente |
|---|---|---|
| Etiquetas de campos | Sin novedades respecto a la tabla de arriba (2026-10-10); la búsqueda web devuelve sobre todo Edenor/Edesur **de Argentina**, que son otras empresas | búsquedas web |
| Base legal | Sigue vigente: la factura debe traer días facturados, lecturas con fecha y si es promediada o por lectura (Reglamento de la Ley 125-01) | arriba |
| Factura electrónica (e-CF) | La Ley 32-23 la hace obligatoria con plazos escalonados (hasta 36 meses para contribuyentes pequeños). **No se halló** que EDESUR, EDENORTE o EDEESTE hayan cambiado el diseño de su factura; si lo hacen aparecerían campos nuevos (e-NCF, código QR) que el parser no conoce | DGII, Siempre Al Día |
| Consumo promediado de EDENORTE | Sigue sin confirmarse cómo se etiqueta | — |
| Duplicado del portal | No se pudo ver si el duplicado es un PDF con texto o una imagen. El pipeline ya soporta ambos (capa de texto o OCR por página, máx. 6 páginas) | — |

### Lo que sigue **sin confirmar** (la fila de cada uno es una hipótesis, no un hecho)
1. Etiqueta literal del **total** en EDESUR y EDENORTE (el parser busca `TOTAL A PAGAR`).
2. Etiqueta de la **fecha límite de pago** en EDENORTE y EDEESTE (solo EDESUR está documentada: `FECHA LIMITE DE PAGO`). Es el campo que
   alimenta la alerta de pago: un error aquí avisaría un día equivocado.
3. Calidad con **fotos reales de celular** (todo lo medido fue con imágenes sintéticas).
4. Si el PDF descargado del portal trae capa de texto o es una imagen.

### Qué se cambió en el código por esto (con pruebas sintéticas; **no** es una confirmación)
- `parser.py`: si falta `TOTAL A PAGAR`, el total se busca en etiquetas alternativas (`MONTO A PAGAR`, `VALOR A PAGAR`, `IMPORTE A PAGAR`,
  `TOTAL FACTURA(DO)`, `TOTAL GENERAL`, `IMPORTE TOTAL`, `MONTO TOTAL`, `TOTAL A COBRAR`). Sale con confianza **`inferred`** y un aviso
  («se leyó de una etiqueta distinta de TOTAL A PAGAR»), así que la persona siempre lo revisa antes de guardar. Nunca se toman
  `SUBTOTAL`, `Total energía`, `Total impuestos` ni `Total cargos`. `TOTAL A PAGAR` conserva confianza alta y gana si coexiste.
- La fecha límite ya aceptaba `fecha límite (de pago)`, `fecha de vencimiento`, `vencimiento`, `vence`, `pague/pagar antes del`; ahora hay
  pruebas para cada variante, para la incoherencia con el período (se descarta con aviso) y para no confundirla con la fecha de emisión.
- `tests/test_ocr_label_variants.py` (22 pruebas). El arnés `scripts.ocr_qa` puntúa también `due_date` (desde ERD-ALERT-02).

### Riesgos que quedan abiertos
- Una etiqueta alternativa mal supuesta no rompe nada (sale `inferred` y se confirma), pero **no mejora la lectura** si la real es otra.
- Una factura con **e-NCF/QR** podría traer números que el parser no distingue de montos; no hay forma de saberlo sin una muestra.
- Las 3 etiquetas dudosas de arriba solo se cierran con facturas reales.

### Para cerrar la tarea (lo único que falta)
Mínimo 1 factura real por distribuidora —idealmente 3, una de ellas foto de celular— con nombre, dirección, NIC/contrato y medidor
tapados (no tapar fechas, lecturas, consumo, total ni fecha límite), guardadas en `qa-private/` (ignorado por git) con su
`expected.json`, y correr `cd backend/api && uv run python -m scripts.ocr_qa ../../qa-private/<carpeta> --json informe.json`
(criterio: 0 errores silenciosos). Instrucciones completas en `docs/qa/OCR_REAL_QA.md`.

---

## Evaluación con 3 facturas reales (2026-10-11, ERD-OCR-REAL-QA)

Manuel compartió una imagen real de cada distribuidora (duplicados de EDESUR 2019, EDENORTE 2020 y EDEESTE 2024; vistas previas
de **768 × 1024 px**, de las que circulan en internet). **Contienen datos de terceros: no están en el repositorio ni en `qa-private/`**
(las reejecuciones usan los originales privados fuera de git). Aquí solo constan etiquetas, formatos y resultados, sin nombres,
direcciones, NIC, contratos ni medidores. Esto **sustituye** la sección «sin facturas reales» de arriba en lo que contradiga.

### Etiquetas confirmadas en facturas reales
| Campo | EDESUR | EDENORTE | EDEESTE |
|---|---|---|---|
| Período | `PERIODO DE FACTURACIÓN  12/08/2019 - 07/09/2019 = 26 días` | `No. De Días Facturados : 18/04/2020 - 17/05/2020 29 días` | `PERIODO DE FACTURACIÓN  19/06/2024 - 20/07/2024 = 31 días` |
| Fecha límite | `FECHA LIMITE PAGO` (2 veces) | **`PAGUE ANTES DE`** | `FECHA LÍMITE DE PAGO` (2 veces) |
| Monto | `IMPORTE TOTAL EN $RD` y, en el talón, `IMPORTE EN RD$` (igual cifra) | **`FACTURADO DE <MES>`** = lo facturado del mes; `VALOR TOTAL A PAGAR` es **otra cifra** | `IMPORTE TOTAL` y `IMPORTE EN RD$` |
| Lecturas | tabla `LECTURA ANTERIOR / ACTUAL / MULTIPLO CONSUMO` con el consumo pegado a `kWh` | columna `CONSUMO PROMEDIADO` (sin lecturas; `CONEXION DIRECTA`) | tabla igual a EDESUR (`4 kWh`) |
| Cálculo | `Cargo fijo 26 días`, `200 kWh x RD$ 4.44`, `34 kWh x RD$ 6.97` | `Cargo Fijo 29 días`, `108 kWh X RD$ 4.44` | `Cargo fijo 31 días`, `4 kWh x RD$ 6.17/kWh` |
| Otros | `NCF`, `REFERENCIA DE PAGO`, `NIC`, código de barras con el importe | `NCF`, `Válida Hasta: 31/12/2999`, `CONTRATO`, `Ref. Pago` | `NCF`, **`FECHA VENCIMIENTO NCF`** (vigencia del comprobante), `NIC` |

Hallazgos que cambian el código:
1. **`TOTAL A PAGAR` no aparece en EDESUR ni EDEESTE**: usan `IMPORTE TOTAL`. Las etiquetas «alternativas» que se habían supuesto eran correctas.
2. **EDENORTE: «valor total a pagar» ≠ lo facturado.** En la muestra, `FACTURADO DE MAY` = cargo fijo + energía (la suma cuadra al centavo) y el total a pagar es
   una cifra mayor (arrastra saldos). Para el monto de la factura se usa lo facturado del mes y se avisa si difieren.
3. **`FECHA VENCIMIENTO NCF` (EDEESTE) y `Válida Hasta` (EDENORTE) son la vigencia del comprobante fiscal, no la fecha de pago**: el
   parser anterior habría tomado 31/12/2024 como fecha límite. Ahora se excluyen.
4. Ruido real de Tesseract en imágenes pequeñas: `07.09/2019` por `07/09/2019`; `2004` por `2024` o `2026`; `1OB` por `108`; `AcivaBT.`;
   separador de miles `4.971`; `IMPORTE EN RDS 126223` (se pierden la coma y el punto); multiplicador `1.0000` → `10000`; `4 kWh` → `40`.
   (Las cifras de estos ejemplos se eligieron del patrón de ruido; los tests usan números inventados.)

### Qué se cambió (parser, motor y arnés)
- **Motor** (`preprocess.py`, `pipeline.TesseractEngine`): antes una sola lectura con el ajuste por defecto; ahora hasta 4 pasadas (canal
  de máximo brillo, ampliado a ~2600 px, con segmentación 4/6/3 y una con el fondo aplanado) y se queda la que lee más campos y menos
  se contradice; conserva alternativas y solo corta anticipadamente cuando los campos requeridos están presentes y el
  monto tiene confianza alta, dentro del 80 % del tiempo máximo por página. Solo Pillow.
- **Parser**: `FACTURADO DE`, `IMPORTE TOTAL/EN` (alta solo si dos lecturas coinciden; si no, `inferred`), centavos si se perdió la
  puntuación (siempre `inferred` + aviso), `PAGUE ANTES DE` / `FECHA LIMITE PAGO` como etiquetas principales, vigencia del NCF excluida,
  punto en las fechas del período, reparación del año mal leído **solo** si exactamente un arreglo cuadra con los días impresos (o el
  más cercano a la fecha de emisión decide), cifras con letras junto a `kWh x RD$`, fila de lecturas tolerante (consumo calculado
  de las lecturas con multiplicador supuesto 1, siempre `inferred`).
- **Arnés**: `scripts.ocr_qa` ahora lee como producción (antes usaba el lector simple).

### Resultado: verificación independiente de la recuperación (2026-10-11)

La afirmación anterior de **22/22 no se reprodujo** en la base `fef74c8`: el resultado independiente inicial fue **17/22**. Tras las correcciones de selección y lectura, la ejecución de producción y el recorrido API/worker con almacenamiento cifrado coinciden:

| Factura | Resultado independiente actual |
|---|---|
| EDESUR | **8/8** campos correctos |
| EDENORTE | **5/6**; importe ausente con advertencia explícita de revisión manual |
| EDEESTE | **8/8** campos correctos |
| **Total** | **21/22**, 1 ausente, 0 incorrectos; seguridad satisfecha, exactitud completa NO |

Evidencias sanitizadas: [`ocr-real-fields.json`](evidence/dev-recovery-2026-10-11/ocr-real-fields.json) y [`ocr-api-worker.json`](evidence/dev-recovery-2026-10-11/ocr-api-worker.json). No contienen valores personales. El importe ambiguo EDENORTE se deja vacío, sin preferir una cifra incorrecta ni calcularla desde cargos. La repetición de una inferencia no aumenta su confianza; discrepancias entre variantes la reducen.

El recorrido API/worker procesó tres originales reales con Tesseract, cifrado local y PostgreSQL aislado. Confirmó las facturas utilizando expectativas transcritas visualmente y verificó el readback, sin crear una factura antes de confirmar. Es FastAPI TestClient en proceso: **no** demuestra revisión humana, UI móvil, bucket cloud ni transporte HTTP externo.

### Límites — leer antes de confiar en estos números
- **3 imágenes, una por distribuidora, y las reglas se afinaron mirando esas mismas imágenes**: 21/22 no es una tasa de
  acierto generalizable. El riesgo de sobreajuste es real; hacen falta facturas que **no** se hayan usado para afinar.
- Son vistas previas de baja resolución (768 px) de facturas de 2019, 2020 y 2024; **no** son fotos de celular (ángulo, sombras, arrugas)
  ni los PDF actuales del portal. Un PDF con capa de texto debería ser más exacto, pero **no se probó**.
- **EDENORTE sin lecturas** en la muestra (consumo promediado): el parser lee el consumo por las líneas de cálculo (`inferred`).
- El multiplicador se supone 1 cuando no se lee; un cliente con multiplicador ≠ 1 vería un consumo menor (por eso es `inferred` y avisa).
- `FACTURADO DE` y `PAGUE ANTES DE` se confirmaron en **una** factura de EDENORTE de 2020; el formato puede haber cambiado.
- Sigue sin verificarse: la etiqueta del total en una factura **actual** de EDESUR/EDENORTE, e-NCF/QR en facturas nuevas, y el PDF del portal.

### Para cerrar la tarea
Facturas **nuevas** (idealmente 3 por distribuidora, con al menos una foto de celular y un PDF del portal), tapando nombre, dirección,
NIC/contrato y medidor, en `qa-private/` con su `expected.json`, y correr `scripts.ocr_qa`. Lo que falle se corrige con una prueba
sintética nueva (sin datos reales). Criterio: 0 errores silenciosos sobre facturas no usadas para afinar.
