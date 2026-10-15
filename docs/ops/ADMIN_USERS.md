# Usuarios y acceso en el panel (ERD-ADM-USERS-WEB, 2026-10-14)

`frontend-web/admin` → **Usuarios** (`/usuarios`, `/usuarios/[id]`), scope `admin.users.read` (`support_readonly`, `operations_admin`, `super_admin`).
API: `GET /api/v1/admin/users` (búsqueda y página) y `GET /api/v1/admin/users/{id}` (ficha). **Solo lectura**: el BFF solo deja pasar esos GET.

## Qué se ve
Correo, correo verificado, cuenta activa, fecha de alta, nº de viviendas, sesiones activas, roles administrativos vigentes y, en la ficha, versión
de términos aceptada. Las viviendas son un **conteo** (función `admin_user_home_counts`, migración 0034, `SECURITY DEFINER` sin abrir la RLS de
`home_members`); no se dice cuáles son ni cómo se llaman.

## Qué nunca se ve
Contraseñas y hashes, tokens, cookies, sesiones concretas, documentos, facturas, lecturas ni datos de las viviendas. Las pruebas lo verifican.

## Auditoría
- `users.search`: quién buscó y cuándo; metadatos `{with_query, verified_filter, returned}`. **El término buscado no se guarda** (es un dato personal).
- `users.view`: quién abrió la ficha de quién (`users:<id>`).
- Además, como toda ruta administrativa, `scope.authorized` con el scope usado. Consultable en **Auditoría**.

## Reglas de búsqueda
Mínimo 3 caracteres (la API responde 422 y la pantalla avisa antes de enviar), máx. 120; el comodín `%`/`_` se escapa; 25 por página (máx. 100).

## Pendiente (no implementado; necesita decisión)
Los puntos del paquete que **modifican** datos o abren más contenido no están hechos: exportación y borrado solicitados, cerrar sesiones o desactivar
cuentas, y ver viviendas/contratos (ERD-ADM-HOMES-WEB). Cada uno necesita un scope propio de escritura, motivo obligatorio en cada acción, auditoría
y, para viviendas, una política de qué campos puede ver soporte. Hoy los roles se gestionan en «Roles y asignaciones».
