# Plan de verificación en dispositivo (cierra los Prompts 04 y 05)

Lo que queda de iOS y Android no se puede comprobar con pruebas estáticas ni en un entorno sin dispositivo (no hay KVM,
`adb` ni emulador en las sesiones de trabajo). Esta lista es lo mínimo que hay que ejecutar **una vez, a mano**, para poder
marcar ambos prompts como completos. Cada punto tiene un criterio de aprobación y dónde anotar el resultado.

**Ya verificado:** los flujos Maestro de iOS se ejecutaron en simulador (2 corridas verdes, 2026-10-11; ver
`docs/qa/ERD-E2E-MAESTRO-AUTH.md`). Android **nunca** se ha ejecutado. Las pruebas de estructura de teclado
(`keyboardGuard.test.ts`) y de controles (`uiKit.test.ts`) confirman que el código existe, no cómo se ve.

**Preparación:** levantar a mano la API con cuentas (base vacía) y Metro, como indica la cabecera de
`frontend-mobile/app/maestro/run-auth.sh` (el script solo lanza el flujo, no arranca esos servicios), y abrir la app en Expo Go.
Datos sintéticos; no usar cuentas reales.

## A. iOS (Prompt 04) — iPhone con Dynamic Island y un iPhone SE o simulador pequeño

| # | Qué hacer | Aprueba si |
|---|---|---|
| 1 | VoiceOver: recorrer Login, Inicio, Facturas → Nueva factura, Perfil → Ajustes | Cada control se anuncia con nombre y rol (p. ej. «Correo, campo de texto»); los errores se leen al aparecer; el orden es el visual. |
| 2 | Ajustes → Accesibilidad → Tamaño de letra → **el más grande (AX5)**; abrir Inicio, Facturas, Nueva factura, Perfil, Apagones | Ningún texto se corta ni se solapa; los botones crecen en vez de cortar su etiqueta; todo se puede alcanzar con scroll. |
| 3 | Safe areas: Inicio y formularios en iPhone con Dynamic Island y en SE | Nada queda bajo la isla, la barra de estado ni el indicador de inicio. |
| 4 | Teclado: en Perfil → «Eliminar cuenta…», Ajustes → «Confirmar nueva contraseña» y Compartir vivienda → correo | El campo activo y el botón principal quedan visibles con el teclado abierto; el primer toque en el botón funciona (no solo cierra el teclado). Valida el cambio UI-07. |
| 5 | Gesto de retroceso (borde izquierdo) en pantallas apiladas y hojas inferiores | Vuelve a la pantalla anterior sin perder lo escrito en formularios. |
| 6 | Cámara y fotos en «Leer factura» | El texto del permiso es el de `app.json` (español) y negarlo deja una salida clara. |
| 7 | Orientación | Permanece en vertical (está bloqueada); confirmar que no hay pantalla que dependa de girar. |

## B. Android (Prompt 05) — **Android 15 o superior** (obligatorio) y, si se puede, uno de Android 13/14

| # | Qué hacer | Aprueba si |
|---|---|---|
| 1 | **UI-06, el más importante.** Con el teclado abierto, enfocar el **último** campo de: Lectura nueva, Factura nueva, Ajustes → «Confirmar nueva contraseña», Apagón nuevo, Equipo nuevo | El campo y el botón de guardar quedan visibles y no tapados por el teclado. |
| 1b | Si el 1 **falla**: aplicar `behavior={Platform.OS === 'ios' ? 'padding' : 'height'}` a los `KeyboardAvoidingView` (10 pantallas; `grep -rln KeyboardAvoidingView frontend-mobile/app/src` también lista `keyboardGuard.test.ts`, que no cuenta) y repetir el 1; comprobar además que al cerrar el teclado la pantalla recupera su altura (hay un fallo conocido de `height` en algunos dispositivos). | Pasa el 1 y la altura se restaura. Si `height` no restaura, probar `padding` o `react-native-keyboard-controller`. |
| 2 | TalkBack: los mismos recorridos que iOS-1 | Mismo criterio que VoiceOver. |
| 3 | Ajustes → Pantalla → **Tamaño de fuente al máximo** y «Tamaño de pantalla» grande | Igual que iOS-2. |
| 4 | Botón/gesto «Atrás» en hojas inferiores (rango de fechas), formularios con cambios y la pantalla raíz | Cierra la hoja o vuelve; en la raíz sale de la app; no pierde datos escritos sin avisar. |
| 5 | Edge-to-edge: Inicio y formularios con barra de navegación por gestos y por botones | Nada queda bajo la barra de estado ni la de navegación. |
| 6 | Permisos de cámara y fotos; `RECORD_AUDIO` | Los textos son los de `app.json`; el permiso de micrófono **no** aparece. |
| 7 | Rotar el dispositivo | La app permanece en vertical. |

## C. Qué registrar al terminar

1. Resultado de cada fila (aprobó / falló / no aplica) con modelo y versión del sistema, en una tabla nueva de este archivo.
2. Capturas de los fallos en `docs/qa/evidence/` (datos sintéticos; sin correos ni tokens).
3. Actualizar `docs/audit/CIERRE-UI-QA-2026-10-13.md`: filas 04 y 05 de la tabla de prompts, y los hallazgos UI-03 y UI-06.

Con las filas A-1…A-7 y B-1…B-7 aprobadas, **los Prompts 04 y 05 pasan a completos**.
