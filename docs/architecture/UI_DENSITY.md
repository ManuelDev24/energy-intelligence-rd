# Densidad y tamaño de controles (ERD-UI-DENSITY, 2026-10-12)

Un solo contrato visual para formularios, que cada plataforma implementa con su propio componente
(la decisión de [UI_KIT.md](UI_KIT.md) de no crear `packages/ui` se mantiene).

## Web (`frontend-web/app/src/components/ui/`)

| Pieza | Regla |
|---|---|
| `control.ts` | Fuente única de altura, tipografía y ancho de los controles. |
| Altura | **36 px** con puntero fino y **44 px** con puntero táctil (`pointer-coarse:`). Los 44 px vienen de auditorías de accesibilidad previas; no se bajan a 36 px en pantallas táctiles. |
| Texto | 14 px en el campo, 13 px en la etiqueta, 12 px en ayuda y error. |
| Ancho (`width`) | `xs` 140 px (códigos, cantidades, hora) · `sm` 220 px (fecha, teléfono, kWh, montos) · `md` 320 px (**defecto**: nombres, contraseñas) · `lg` 400 px (correo, notas) · `full` (direcciones y formularios en contenedores ya estrechos, como el login). El tope aplica a etiqueta + control + mensajes. |
| `FormField` / `Field` / `Select` / `Checkbox` | Mismo `aria-describedby`, `aria-invalid` y mensaje `role="alert"`. Sin `name` ni `id` se genera uno con `useId`. |
| `Button` | Variantes `primary`, `outline`, `tertiary`, `danger`; tamaños `md`, `sm`, `icon`; `loading` deshabilita y marca `aria-busy`. |
| `Checkbox` | Casilla de **24 px** (mínimo WCAG 2.5.8); la fila mide 36 px y 44 px en táctil. |
| `ScrollRegion` | Todo contenedor con `overflow-x-auto` (tablas anchas) debe ser `ScrollRegion`: rol `region`, nombre y foco por teclado. |
| `Card` | `density`: `compact` 12 px · `default` 16 px · `roomy` 24 px (antes todas eran 24 px). |
| Color | Errores y éxitos usan los tokens `danger` y `success`, no `text-red-*` / `text-green-*`. |

Cómo elegir el ancho: depende del **tipo de dato**, no del contenedor. Si dudas, deja el defecto `md`.

## Móvil (`frontend-mobile/app/src/components/`)

- No se trasladan las medidas de escritorio. `Field` y `Button` mantienen **44 pt** mínimos (`TOUCH`) y fuente de 16 pt.
- `Button`: `primary`, `secondary`, `tertiary`, `danger`, y `loading` (`accessibilityState.busy`).
- Hay un único `Field`; `BillFormScreen` ya no tiene una copia local.
- Formularios a una columna; el ancho semántico no aplica en teléfono.
- El escalado de fuente del sistema queda activo (RN lo aplica salvo que se desactive `allowFontScaling`).

## Lo que NO se hizo, y por qué

- **`frontend-web/admin`** conserva su HTML mínimo: es una consola provisional (ver su `package.json`), y añadirle Tailwind
  alteraría su CSP y sus pruebas de seguridad. Adoptará el kit cuando empiece el Módulo 4.
- **Tablas de ítems de factura** (`BillItemsSection`) siguen con `<input>` y `<select>` propios: son celdas densas de
  tabla, no formularios. Migrarlas requiere un `Input` de tabla con su propia variante.
- **Modo oscuro**: sigue fuera por decisión previa (faltan tokens semánticos oscuros).

## Verificación realizada

Typecheck y lint de todos los workspaces; 97 + 17 + 65 pruebas de paquetes, 853 de web, 547 de móvil y 23 de admin;
`check_architecture.py`; `contracts:check`; `next build` de producción con el gate `verify-tailwind-css.mjs` (3/3).
Medido en Chromium con el CSS de producción: campos de 320, 140 y 400 px por 36 px, sin scroll horizontal a 390 px.

**No verificado en este entorno:** Maestro y simuladores iOS/Android, y Lighthouse. Antes de promover a `QA`, correr
`npm run e2e` en CI y revisar a mano «Mi cuenta», Perfil, Apagones y el formulario de factura en 360, 390, 768 y 1280 px.
