# UI kit — decisiones (ERD-UI-KIT, 2026-10-10)

## Decisión: `packages/ui` se elimina del diseño
El plan original (`PLAN_COMPLETO_ENERGY_RD.md` §UI) pedía un `packages/ui` para la web y componentes móviles «con la misma
API». **No se implementa**:
- Web (DOM + Tailwind) y móvil (React Native + `StyleSheet`) no pueden compartir componentes; un paquete de UI solo
  serviría a la web, que ya tiene su biblioteca en `apps/web/src/components`. Crearlo sería una capa vacía.
- Lo que sí se comparte, y funciona, está en `@energyrd/core`: tokens, etiquetas de calidad/severidad, formato y **lógica**
  (ahora también el rango de fechas: `validateRange`, `presetRange`, `MAX_RANGE_DAYS`, antes duplicada en web y móvil).
- La «misma API» se mantiene por convención de nombres y props entre `apps/web/src/components` y
  `apps/mobile/src/components`, y por pruebas en cada lado.

## Regla: no se construye un componente sin consumidor real
Los componentes pendientes se hicieron extrayéndolos de código que ya los usaba, o con el uso que los exige:

| Componente | Web | Móvil | Consumidor |
|---|---|---|---|
| `Modal` / `ConfirmDialog` | ✅ `components/modal.tsx` (foco atrapado y devuelto, Escape, fondo, `aria-modal`, scroll bloqueado) | ❌ no se crea: `Alert.alert` nativo cubre las confirmaciones y es accesible; los casos con contraseña ya van en línea | web: eliminar factura y equipo (antes `window.confirm`) |
| `BillCard` | ✅ extraído de `BillsPage` | ✅ extraído de `BillsScreen` | listas de facturas |
| `RecommendationCard` | ✅ (sobre `AlertCard`, tono ahorro) | ✅ | panel (Inicio) |
| `DateRangePicker` | ✅ extraído de los controles de Consumo | ✅ nuevo (atajos + hoja con dos fechas) | web: Consumo «Por lecturas»; móvil: lo usa ERD-CHARTS-01 |
| `BottomSheet` | ❌ no aplica: la web usa `Modal` | ✅ nuevo | `DateRangePicker` móvil |
| `DeviceCard` | ⏳ con ERD-DEV-02 | ⏳ con ERD-DEV-02 | DEV-02 define sus campos (marca, modelo, tipo, icono, % de consumo); hoy la web usa una tabla, mejor para comparar |

## Verificación y límites
- Web: 8 pruebas de `Modal`/`ConfirmDialog`, 8 de las tres tarjetas y el selector, y 4 de integración de los flujos de
  borrado (diálogo, cancelar, Escape, confirmar). Lint, tipos y 671 pruebas en verde.
- Móvil: lógica pura del rango (6 pruebas) y comprobaciones de estructura (5), typecheck, 431 pruebas y compilación Metro
  de Android. **`BottomSheet` y `DateRangePicker` no se han visto en un simulador ni dispositivo** (ERD-E2E-MAESTRO-AUTH y
  ERD-A11Y-NATIVE).
- No se hizo una pasada de axe/Lighthouse sobre el diálogo nuevo en navegador real: la cubren sus pruebas de foco y ARIA.
