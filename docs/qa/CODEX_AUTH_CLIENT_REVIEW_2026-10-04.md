**Veredicto: pedir cambios.**

Revisión solo lectura, contrastada con el contrato canónico. Reproducciones en memoria con mocks: sin modificar archivos, servidores, red ni imprimir secretos. No confirmé ningún hallazgo Crítico.

1. **Requerido — WEB: login tardío restaura sesión después de logout.**  
   [bff.ts:125](/Users/macbookpro/.hermes/cache/scratch/energy-fullscope-20261004/auth-web/apps/web/src/lib/auth/bff.ts:125), [session.tsx:84](/Users/macbookpro/.hermes/cache/scratch/energy-fullscope-20261004/auth-web/apps/web/src/lib/session.tsx:84).  
   Reproducción: retrasar la respuesta de login, completar logout desde otra pestaña y liberar login. Su `Set-Cookie` reinstala una sesión que logout no conocía ni revocó. `authenticate()` tampoco comprueba su generación antes de publicar usuario. **Arreglo mínimo:** serializar login/logout entre pestañas y comprobar generación después de cada espera de autenticación; abortar el fetch por sí solo no garantiza impedir `Set-Cookie`.

2. **Requerido — WEB: respuesta anterior aceptada tras cambiar de cuenta.**  
   [client.ts:19](/Users/macbookpro/.hermes/cache/scratch/energy-fullscope-20261004/auth-web/apps/web/src/lib/auth/client.ts:19), [homes.ts:9](/Users/macbookpro/.hermes/cache/scratch/energy-fullscope-20261004/auth-web/apps/web/src/lib/auth/homes.ts:9).  
   La generación se comprueba al recibir cabeceras, pero no al consumir el cuerpo. Confirmé que `bffFetch()` → invalidar cuenta → `response.json()` devuelve datos anteriores. Una mutación pendiente puede entregar ese resultado a su consumidor después del cambio; la comprobación no depende de que abortar el transporte funcione. **Arreglo mínimo:** comprobar generación antes y después de leer JSON y antes de resolver operaciones compuestas.

3. **Requerido — MÓVIL: identidad resucitada en la continuación de login.**  
   [session.ts:70](/Users/macbookpro/.hermes/cache/scratch/energy-fullscope-20261004/auth-mobile/apps/mobile/src/auth/session.ts:70), también línea 144.  
   Reproducción con almacenamiento simulado: completar `save()`, intercalar logout antes de continuar `signIn()` y mantener pendiente su respuesta remota. Login publica nuevamente `authenticated` con el usuario anterior, después del límite de logout. Confirmé resurrección de identidad; no afirmo resurrección de tokens utilizables. **Arreglo mínimo:** `checkEpoch(epoch)` inmediatamente después de `await save()` y antes de publicar identidad; comprobarlo también antes de asignar tokens en memoria.

4. **Requerido — AMBOS: errores arbitrarios del servidor llegan a pantalla.**  
   WEB: [bff.ts:61](/Users/macbookpro/.hermes/cache/scratch/energy-fullscope-20261004/auth-web/apps/web/src/lib/auth/bff.ts:61). MÓVIL: [homes.ts:23](/Users/macbookpro/.hermes/cache/scratch/energy-fullscope-20261004/auth-mobile/apps/mobile/src/api/homes.ts:23), [states.tsx:45](/Users/macbookpro/.hermes/cache/scratch/energy-fullscope-20261004/auth-mobile/apps/mobile/src/components/states.tsx:45).  
   `detail` y `msg` aceptan cualquier texto. Un 500 con un marcador arbitrario atraviesa el BFF; los errores de dominio móviles usan igualmente el parser compartido y se muestran. Si servidor/proxy refleja información sensible, queda expuesta. **Arreglo mínimo:** mensajes locales por estado/código y traducciones permitidas para campos. La auth móvil ya hace esto; extenderlo al dominio.

5. **Opcional — MÓVIL: falta validación de HTTPS para release.**  
   [config.ts:17](/Users/macbookpro/.hermes/cache/scratch/energy-fullscope-20261004/auth-mobile/apps/mobile/src/config.ts:17).  
   Acepta `http://…`; sin configuración cae en direcciones locales HTTP. Si la plataforma permite tráfico claro, credenciales y tokens quedan interceptables; si lo bloquea, falla la conexión. **Arreglo mínimo:** exigir origen HTTPS explícito fuera de `__DEV__`. Lo clasifico como endurecimiento porque HTTPS ya es un requisito operativo documentado.

**Áreas sin defecto concreto confirmado:** CSRF/origen; traversal, `%2e%2e`, doble codificación, dobles barras y query smuggling hacia rutas prohibidas; SSRF del BFF; reenvío de `Authorization`/`Cookie` del navegador; flags de cookies; tokens en HTML, logs, almacenamiento no seguro o URLs; modo piloto en producción. En móvil, no encontré reutilización de refresh por concurrencia normal: single-flight y borrado previo están implementados. Caché/vivienda se limpian, con las carreras señaladas arriba.

**Límites documentados:** ausencia de recuperación de contraseña, MFA, verificación de correo y rate limiting. No los cuento como defectos nuevos. No validé comportamiento nativo ni HTML servido mediante ejecución.