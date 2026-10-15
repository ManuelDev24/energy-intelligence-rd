"""Auditoría C-01 × ERD-ADM-RBAC: acceso administrativo ACOTADO a los documentos para operar el OCR.

La operación de la cola de OCR (listar, reintentar, cancelar) cruza viviendas por diseño, pero el API conecta como `erd_app`, sujeto a la RLS
por vivienda. En lugar de relajar la política general, se añade una política adicional que solo existe para `documents` (y, por herencia,
para `document_ocr`, cuya política consulta `documents`) y solo para SELECT/UPDATE, activa cuando la transacción declara `app.admin_ocr = 'on'`.
Esa declaración solo la hace `services/admin_ocr.py`, detrás de los scopes `admin.ocr.*`. Facturas, lecturas, equipos, etc. siguen aisladas.
"""
from alembic import op

revision = "0031"
down_revision = "0030"
branch_labels = None
depends_on = None

APP = "erd_app"


def upgrade():
    op.execute("""CREATE FUNCTION app_admin_ocr() RETURNS boolean LANGUAGE sql STABLE PARALLEL SAFE
                  AS $$ SELECT coalesce(current_setting('app.admin_ocr', true), '') = 'on' $$""")
    op.execute(f"GRANT EXECUTE ON FUNCTION app_admin_ocr() TO {APP}, erd_worker")
    op.execute(f"CREATE POLICY admin_ocr_select ON documents FOR SELECT TO {APP} USING (app_admin_ocr())")
    op.execute(f"CREATE POLICY admin_ocr_update ON documents FOR UPDATE TO {APP} USING (app_admin_ocr()) WITH CHECK (app_admin_ocr())")


def downgrade():
    op.execute("DROP POLICY IF EXISTS admin_ocr_update ON documents")
    op.execute("DROP POLICY IF EXISTS admin_ocr_select ON documents")
    op.execute("DROP FUNCTION IF EXISTS app_admin_ocr()")
