# Formato de las facturas eléctricas de RD (EDESUR, EDENORTE, EDEESTE) — base del parser OCR

- Investigación: 2026-10-10 (Manuel, ERD-REL-VERIFY). Fuentes públicas en internet; **ninguna foto real de
  factura entra al repo**. Las facturas de terceros publicadas en Scribd/Studocu se usaron **solo** para leer
  etiquetas y formatos; no se copió ningún nombre, dirección, NIC, contrato ni monto.
- Parser: `services/api/app/services/ocr/parser.py`. Pruebas: `services/api/tests/test_ocr_parser_rd_layouts.py`.

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
