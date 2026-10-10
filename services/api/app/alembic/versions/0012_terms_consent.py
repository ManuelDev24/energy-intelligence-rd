"""ERD-AUTH-03: consentimiento de términos (versión + fecha) en users.

Nullable para usuarios legados creados antes del consentimiento. Las dos columnas van juntas:
o ambas vacías (legado) o ambas presentes (aceptación registrada por el servidor).
"""
from alembic import op
import sqlalchemy as sa

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("terms_version", sa.String(32), nullable=True))
    op.add_column("users", sa.Column("terms_accepted_at", sa.DateTime(timezone=True), nullable=True))
    op.create_check_constraint("ck_users_terms_consent", "users",
                               "(terms_version IS NULL) = (terms_accepted_at IS NULL)")


def downgrade():
    op.drop_constraint("ck_users_terms_consent", "users", type_="check")
    op.drop_column("users", "terms_accepted_at")
    op.drop_column("users", "terms_version")
