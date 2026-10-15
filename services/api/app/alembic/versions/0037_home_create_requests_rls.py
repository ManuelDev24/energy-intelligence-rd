"""ERD-ONB-ACCEPTANCE: RLS para `home_create_requests` (0035 la dejó sin RLS aunque lleva `home_id`).

Cada persona solo ve y escribe sus propias claves (`user_id = app_user()`); el worker conserva acceso total. La clave se lee ANTES de fijar la
vivienda del contexto, por eso la política es por persona y no por vivienda.
"""
from alembic import op

revision = "0037"
down_revision = "0036"
branch_labels = None
depends_on = None

APP, WORKER = "erd_app", "erd_worker"


def upgrade():
    op.execute("ALTER TABLE home_create_requests ENABLE ROW LEVEL SECURITY")
    op.execute(f"CREATE POLICY owner_only ON home_create_requests TO {APP} USING (user_id = app_user()) WITH CHECK (user_id = app_user())")
    op.execute(f"CREATE POLICY worker_access ON home_create_requests TO {WORKER} USING (true) WITH CHECK (true)")


def downgrade():
    op.execute("DROP POLICY IF EXISTS worker_access ON home_create_requests")
    op.execute("DROP POLICY IF EXISTS owner_only ON home_create_requests")
    op.execute("ALTER TABLE home_create_requests DISABLE ROW LEVEL SECURITY")
