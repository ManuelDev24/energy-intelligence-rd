# ERD-A11Y-NATIVE — accesibilidad nativa (lector de pantalla, foco, contraste, estados, áreas táctiles)

**Estado: PARTE ESTÁTICA VERIFICADA; PARTE CON LECTOR DE PANTALLA EN DISPOSITIVO NO EJECUTADA.** No hay iPhone, Android, VoiceOver ni TalkBack en este entorno.

## Verificado (corre en CI: `frontend-mobile/app/src/a11yStatic.test.ts`, 25 pruebas)
| Comprobación | Resultado |
|---|---|
| Todo `Pressable`/`Touchable*` declara `accessibilityRole` | cumple (0 infracciones) |
| Todo `TextInput` y `Switch` declara `accessibilityLabel` | cumple |
| Todo control `radio` expone `selected`/`checked` | cumple |
| Botones de solo icono tienen nombre accesible | cumple |
| Contraste WCAG 2.x ≥ 4.5:1 de 17 pares del tema (texto, atenuado, botón, opción activa, badges REAL/ESTIMADO/PROYECTADO/INFERIDO, errores, avisos) | cumple |
| Área táctil mínima 44 pt aplicada en `Button`, `Segmented`, `ChoiceGrid`, `Checkbox` | cumple |
| El escáner funciona (encuentra decenas de elementos y detecta una infracción sembrada) | sí, para que «0 infracciones» signifique algo |

Además: `ERD-UI-KIT` ya probó el cierre accesible del teclado en iOS y las hojas modales (`accessibilityViewIsModal`); `docs/architecture/COLOR_CONTRAST.md` mantiene la guardia de tokens en `@energyrd/core`.

## NO verificado (hay que hacerlo con un dispositivo)
Checklist para quien tenga el teléfono — marcar solo con evidencia:

| # | Prueba | VoiceOver (iOS) | TalkBack (Android) |
|---|---|---|---|
| 1 | Inicio de sesión / registro: el orden de foco es correo → contraseña → términos → botón; los errores se anuncian | ☐ | ☐ |
| 2 | Onboarding de 6 pasos: «Paso n de 6» y el título se anuncian al cambiar de paso; los errores toman el foco | ☐ | ☐ |
| 3 | Tabs: nombre, posición y estado seleccionado; la insignia de alertas se anuncia | ☐ | ☐ |
| 4 | Inicio: cada tarjeta se lee como una unidad con su etiqueta de calidad (REAL/ESTIMADO/PROYECTADO) | ☐ | ☐ |
| 5 | Gráficos: el resumen textual se lee; las barras decorativas se ignoran | ☐ | ☐ |
| 6 | Equipos: la tarjeta lee nombre, tipo, marca/modelo, uso y % del total; selector de tipo e icono navegable | ☐ | ☐ |
| 7 | Facturas: formulario con teclado decimal; «Listo» en iOS; error de kWh anunciado | ☐ | ☐ |
| 8 | Alertas: severidad dicha en palabras (no solo por color); acciones con el nombre de la alerta | ☐ | ☐ |
| 9 | Modales / hojas (rango personalizado, confirmar eliminar): el foco queda dentro y «atrás» cierra | ☐ | ☐ |
| 10 | Tamaño de texto del sistema al 200 %: nada se corta ni se solapa | ☐ | ☐ |
| 11 | Modo oscuro / contraste alto del sistema (la app hoy es solo tema claro) | ☐ | ☐ |
| 12 | Reducir movimiento: no hay animaciones esenciales | ☐ | ☐ |

## Límites declarados
- Un `accessibilityLabel` presente no garantiza que se **lea bien** ni en buen orden: eso solo lo dice el lector de pantalla.
- El contraste se mide con el tema claro; el tema oscuro no existe.
- `accessibilityLiveRegion` (Android) y los anuncios de iOS se declaran en el código, pero su comportamiento real no se observó.
