# Tarifa residencial BTS-1 — octubre–diciembre 2026 (verificada)

**Fuente:** Resolución **SIE-121-2026-TF**, Superintendencia de Electricidad.
- Ficha: https://sie.gob.do/document/sie-121-2026-tf/
- PDF: https://sie.gob.do/wp-content/uploads/2026/10/SIE-121-2026-TF.pdf (escaneado, sin capa de texto; valores leídos visualmente de la imagen de la página y contrastados con el OCR de la regla de bloques).

**Cómo se verificó:** Codex localizó la resolución, pero no pudo leer los cuadros. El coordinador descargó el PDF oficial, renderizó las páginas a 220 dpi y transcribió el cuadro de la **página 9** (Artículo 2) y el texto de las **páginas 10–11** (Artículo 4) a partir de las imágenes ampliadas. Las imágenes de evidencia están en `~/.hermes/cache/scratch/energy-phase2/pages/p09.png`, `p10.png` y `p11.png`.

## Qué columna se factura (Art. 4, p. 10)
Las distribuidoras EDESUR, EDEESTE y EDENORTE facturan a los usuarios **BTS-1 y BTS-2** con los cargos de la columna **"Tarifas de Transición a aplicar en el trimestre octubre–diciembre 2026"**. Esto aplica a las **facturas que se emitan en el trimestre octubre–diciembre 2026**:
- Cuadro del **Artículo 2** para usuarios en circuitos interconectados al SENI.
- Cuadro del **Artículo 3** para el Sistema Aislado de Pedernales. **No está cargado** en el sistema.

## Regla de bloques (Art. 4, p. 11)
| Consumo del mes | Cómo se factura |
|---|---|
| 0–200 kWh | Toda la energía al precio del 1er rango |
| 201–300 kWh | Primeros 200 kWh al 1er rango; el resto (hasta 100 kWh) al 2º rango |
| 301–700 kWh | 200 kWh al 1º, 100 kWh al 2º y el resto (hasta 400 kWh) al 3er rango |
| **≥ 701 kWh** | **Todos** los kWh al precio del **4º rango** (sin escalonado) |

El cargo fijo depende del consumo mensual: un valor para **0–100 kWh** y otro desde **101 kWh** en adelante.

## Valores BTS-1 — Tarifas de Transición (SENI, Art. 2, p. 9)
| Concepto | Unidad | EDESUR | EDENORTE | EDEESTE |
|---|---|---|---|---|
| Cargo fijo, consumo 0–100 kWh | RD$ | 42.10 | 40.33 | 41.34 |
| Cargo fijo, consumo ≥ 101 kWh | RD$ | 128.59 | 126.81 | 127.83 |
| Energía, rango 1 (0–200) | RD$/kWh | 6.05 | 5.97 | 6.17 |
| Energía, rango 2 (201–300) | RD$/kWh | 8.59 | 8.51 | 8.71 |
| Energía, rango 3 (301–700) | RD$/kWh | 12.89 | 13.83 | 13.04 |
| Energía, rango 4 (≥ 701, todos los kWh) | RD$/kWh | 13.09 | 14.04 | 13.26 |

## Referencia (no se factura; útil para mostrar subsidio)
| Concepto | EDESUR | EDENORTE | EDEESTE |
|---|---|---|---|
| Cargo fijo (ambos rangos) RD$ | 65.23 | 52.32 | 59.62 |
| Energía, todos los rangos RD$/kWh | 15.12 | 16.09 | 15.53 |

## Ejemplos de control (EDESUR, cálculo manual; deben coincidir con el motor)
- 80 kWh: 42.10 + 80×6.05 = **RD$ 526.10**
- 250 kWh: 128.59 + 200×6.05 + 50×8.59 = **RD$ 1,768.09**
- 500 kWh: 128.59 + 200×6.05 + 100×8.59 + 200×12.89 = **RD$ 4,775.59**
- 750 kWh: 128.59 + 750×13.09 = **RD$ 9,946.09**

## Fuera de alcance / no verificado
- Impuestos, alumbrado y otros cargos que puedan aparecer en la factura **no figuran en este cuadro**. Por eso el costo calculado es "energía + cargo fijo según el pliego", no el total exacto de la factura → calidad **ESTIMATED**.
- BTS-2, BTD, BTH y MT no se cargan (no son residencial simple).
- Bono Luz (ADESS: equivalente a 100 kWh) no se modela.
- La tarifa caduca el **2026-12-31**. Hay que cargar la resolución del trimestre siguiente; sin ella el sistema debe responder `tariff_unavailable`, nunca reutilizar en silencio la anterior.
