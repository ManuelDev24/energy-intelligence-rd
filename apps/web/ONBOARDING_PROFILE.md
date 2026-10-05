# ERD-ONB-01 / ERD-PROF-01 — alcance web

## Inventario previo (reutilizado, no reconstruido)

- `src/components/onboarding-wizard.tsx`: bienvenida, ubicación, distribuidora, tipo de usuario, perfil energético, contrato opcional, meta opcional y revisión. Crea la vivienda una vez al elegir distribuidora; conserva su UUID para PATCH en etapas posteriores. `initialHome` permite reanudar desde Mis viviendas sin otro POST.
- `src/lib/auth/onboarding.ts`: escrituras mediante el BFF, validación de UUID y de respuesta con los contratos compartidos, comprobación de identidad de vivienda, y descarte por generación de cuenta después de leer cuerpos. No reintenta escrituras automáticamente.
- `src/lib/auth/bff-onboarding.test.ts`: allowlist de métodos/rutas, cuerpos estrictos, sesión obligatoria, validación de respuestas y mensajes locales sin detalle upstream.
- `/homes`: selección de viviendas accesibles, añadir y configurar/reanudar. `/account`: correo de la sesión y cierre de sesión. La meta ya tiene su propia página; no se duplicó aquí.

## Completado en esta entrega

### Onboarding

- La interfaz vuelve a comprobar la generación de cuenta antes de adoptar el UUID creado y antes de avanzar. Una respuesta tardía no completa una etapa de la cuenta anterior.
- Una etapa posterior fallida conserva la vivienda creada: reintentar utiliza PATCH con el mismo UUID, no POST. Este comportamiento previo quedó cubierto explícitamente.
- Si el POST no se puede confirmar (red, respuesta inválida o error 5xx), se bloquea repetir la creación y se ofrece consultar Mis viviendas con navegación de documento completa. No se presume que un POST fallido no llegó al servidor.
- La reanudación recupera los campos de vivienda existentes. Omitir contrato o meta no ejecuta su PUT; no borra un contrato existente.

### Perfil (`/profile`)

- Acceso visible en la navegación lateral y cabecera de pantallas estrechas, sin agregar destinos a la barra inferior de seis opciones. La ruta usa la misma protección de las otras páginas privadas; no se cambiaron cookies, autenticación ni permisos.
- **Mi cuenta:** correo de la sesión, solo lectura. Las preferencias de notificación se muestran explícitamente **no disponibles**: no existe endpoint para leerlas/guardarlas, por lo que no se incluyen controles ficticios.
- **Mi vivienda:** lectura `GET /homes/{uuid}` y edición parcial `PATCH /homes/{uuid}` de nombre, dirección, ciudad, provincia, municipio, sector, distribuidora, tipo de usuario, ocupantes y los cinco indicadores energéticos. Solo se envían campos modificados. Limpiar explícitamente un opcional envía `null`; no modificarlo lo omite.
- Aire acondicionado, calentador, piscina, paneles e inversor distinguen `null` («Sin indicar»), `true` («Sí») y `false` («No»). No se deduce una opción desconocida.
- **Mi servicio:** distribuidora real de la vivienda y número de cuenta mediante `GET/PUT /homes/{uuid}/contract`. Un 404 se presenta como «no encontrado o sin acceso», no como prueba de inexistencia ni de permiso; se permite intentar registrar un número y el servidor comprueba acceso. Otros errores de lectura ofrecen reintento sin habilitar edición con datos supuestos.
- Cada escritura se vuelve a leer por GET antes del mensaje de éxito. Si falla esa lectura, no se anuncia éxito. Los errores se eligen por estado/código localmente en español, nunca por texto remoto.
- Validación local: nombre no vacío, textos de hasta 120 caracteres (dirección: 255), ocupantes enteros de 1 a 999, número de cuenta de 1 a 120 caracteres después de quitar espacios exteriores. Los campos inválidos se describen y reciben foco.
- Caché del perfil separada por cuenta y vivienda, sin `placeholderData` de otra selección. Al guardar vivienda se invalidan su prefijo de datos derivados y la lista exacta de viviendas, no el prefijo de otra vivienda. El cierre/cambio de cuenta sigue limpiando la caché a través de SessionProvider.

### BFF

- Se conserva la allowlist y no se agrega un proxy abierto: PATCH de vivienda y GET/PUT de contrato ya estaban declarados.
- Se rechazan consultas incluso de paginación en la ruta de una vivienda individual; el contrato ya rechazaba consultas desconocidas/repetidas. La lista `/homes` conserva sus reglas existentes.
- Las solicitudes/respuestas privadas siguen usando `no-store` y `Vary: Cookie`. PATCH no materializa en su cuerpo los opcionales omitidos.
- Corrección R3 de revisión independiente: errores429 conservan únicamente `Retry-After` upstream si es entero positivo canónico entre1 y86400 segundos (máxima ventana API). No se reenvían cookies ni cabeceras arbitrarias. Regresión login/register observada RED null→GREEN57; suite web258 aprobadas/5 omitidas, lint/typecheck exit0.

## Límites reales

- No hay endpoint de preferencias de notificación, edición de correo, recuperación de contraseña, verificación de titularidad, ni borrado de contrato. No se simulan esas capacidades.
- Tipo de usuario es texto libre; no existe catálogo oficial de tipos, provincias/municipios/sectores ni selección de tarifa a partir de ese texto.
- Perfil requiere el modo autenticado; el piloto muestra indisponibilidad de edición en lugar de intentar el BFF deshabilitado.
- La API no proporciona idempotencia de creación: una respuesta incierta requiere consultar la lista, no una repetición automática segura. No se garantiza deduplicación entre pestañas ni entre envíos nuevos independientes.
- No se persiste un borrador privado de onboarding en almacenamiento local. Tras recargar se reanuda desde una vivienda confirmada en Mis viviendas; las etapas pendientes no guardadas se deben rellenar de nuevo.
- No se modificaron backend, contratos compartidos, dependencias ni permisos. No se hizo commit.

## Verificación y TDD

RED observado antes de implementar, seguido de GREEN:

1. Wizard avanzaba a Tipo de usuario tras cambiar la cuenta: ahora descarta la respuesta.
2. Un POST incierto dejaba disponible repetir creación: ahora se bloquea y ofrece consultar viviendas.
3. Perfil no leía/ editaba vivienda; faltaban los lectores de home/contract y la sección de servicio.
4. Limpiar Sector restauraba visualmente «Centro»: ahora representa el `null` explícito.
5. Se enviaban nombre en blanco, ocupantes fraccionarios y provincia demasiado larga: ahora se rechazan localmente; se añadieron ciclos RED/GREEN para `aria-invalid` y foco.
6. Se enviaba número de cuenta en blanco: ahora se rechaza, se describe el error en el campo y recibe foco.
7. Faltaban acceso Perfil y registro de la ruta protegida: ahora se cubren navegación y middleware.
8. `?limit=1` en GET/PATCH de vivienda llegaba upstream: ahora se rechaza antes de contactarlo.

Pruebas adicionales de caracterización y aislamiento: etapa parcial no duplica POST, campos omitidos no se envían, valores desconocidos no se vuelven false, caché por cuenta/vivienda, invalidación específica, escritura tardía sin confirmación/invalidation, respuesta ajena/UUID inválido, cambio de cuenta mientras llega cuerpo de contrato, cabeceras privadas y allowlist estricta.

Comandos desde `apps/web` (Node 24 con fnm):

```sh
fnm exec --using=24 npm test
fnm exec --using=24 npm run lint
fnm exec --using=24 npm run typecheck
```

Resultados finales ejecutados: **240 tests pasados, 5 omitidos** (28 archivos de pruebas pasados, 1 omitido); lint sin errores ni advertencias; typecheck exit 0. Los cinco omitidos son las verificaciones de integración opt-in existentes, no evidencia de integración en vivo.

No se ejecutó build ni se iniciaron servidores. La API 8011 fue apagada por petición: integración HTTP real y revisión visual en navegador **no verificadas**, no sustituidas por resultados ficticios. Las pruebas de UI son jsdom y las de BFF usan transporte controlado; no certifican persistencia de la API desplegada.

## Revisión de interfaz (alcance de esta entrega)

Superficies revisadas por fuente/tests: wizard, Perfil, navegación de AppShell y registro de ruta. Se excluyeron cambios ajenos y recursos generados. Se leyeron interface-review y sus seis dominios better-* del repositorio.

- Accesibilidad: etiquetas nativas, nombres accesibles, selects de tres estados, foco/error de validación y anuncios de carga/error/éxito comprobados en tests. Teclado/lector de pantalla real y contraste renderizado: no verificados.
- Layout: cards y orden Mi cuenta → Mi vivienda → Mi servicio, formulario de una columna que pasa a dos, destinos estrechos en cabecera sin ampliar barra inferior. 320 px/zoom 200%: no verificados en navegador.
- Escritura: términos coherentes con viviendas/cuenta, límites de disponibilidad explícitos, sin afirmaciones de titularidad o permisos, ni mensajes upstream.
- Tipografía/color/UI: reutilizan Field/Button/Card y tokens existentes, sin nuevas paletas, animaciones ni componentes de control. Wrapping y aspecto renderizado: no verificados. Field conserva su tamaño de texto y colores de error preexistentes; no se alteraron primitivas compartidas.

No se declara aprobación visual sin captura/runtime. La cobertura de esta fase es funcional y de fuente.
