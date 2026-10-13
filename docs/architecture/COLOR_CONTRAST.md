# Contraste de color — ERD-UX-TOKENS

Medido con la fórmula WCAG 2.x (luminancia relativa sRGB). Fuente: `packages/core/src/tokens.ts`.
Umbral: 4.5:1 texto normal. Los gráficos y bordes solo necesitan 3:1.

| Par | Ratio | Resultado |
|---|---:|---|
| Texto `#1F2937` sobre fondo `#F5F7F6` | 13.64 | ✅ |
| Texto `#1F2937` sobre blanco | 14.68 | ✅ |
| Blanco sobre primario `#197A52` (botón) | 5.32 | ✅ |
| Primario `#197A52` sobre fondo `#F5F7F6` (enlaces) | 4.94 | ✅ |
| Azul info `#2563EB` sobre blanco / fondo | 5.17 / 4.80 | ✅ |
| Muted `#566577` sobre fondo / blanco | 5.54 / 5.96 | ✅ |
| Muted anterior `#64748B` sobre fondo nuevo | 4.42 | ❌ reemplazado |
| `REAL` `#197A52` sobre `#DCFCE7` | 4.84 | ✅ |
| `ESTIMATED` `#1D4ED8` sobre `#DBEAFE` | 5.49 | ✅ |
| `ESTIMATED` con `#2563EB` sobre `#DBEAFE` | 4.24 | ❌ no usar: `#2563EB` queda para gráficos/info, no para texto de badge |
| `PROJECTED` `#6D28D9` sobre `#EDE9FE` | 5.98 | ✅ |
| Crítica `#B91C1C` sobre `#FEE2E2` | 5.30 | ✅ |
| 🟠 Advertencia `#C2410C` sobre `#FFEDD5` (antes `#B45309`/`#FEF3C7`, 4.51) | 4.52 | ✅ (matiz 17°, naranja) |
| 🟡 Información `#A16207` sobre `#FEF9C3` | 4.58 | ✅ (matiz 35°, separado ≥ 15° de advertencia) |
| 🟢 Ahorro `#197A52` sobre `#DCFCE7` | 4.84 | ✅ |
| `INFERRED` `#475569` sobre `#F1F5F9` (borde punteado) | 6.92 | ✅ |
| Blanco sobre azul info `#2563EB` | 5.17 | ✅ |
| Lima `#C6F432` / blanco sobre `#0B2B1F` (marca) | 11.88 / 15.22 | ✅ |

El logo, splash e icono no se recolorean (`BRAND_ASSETS.md`).
Guardia automática: `packages/core/src/core.test.ts` falla si algún par de `QUALITY` o `SEVERITY` baja de 4.5:1.
