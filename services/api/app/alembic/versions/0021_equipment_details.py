"""ERD-DEV-02: tipo, marca, modelo e icono de cada equipo.

Los equipos existentes quedan como tipo `other` sin marca ni modelo (no se adivina nada a partir del nombre). El tipo y el
icono son catálogos cerrados validados también en la base. Downgrade elimina las columnas (se pierde ese detalle).
"""
from alembic import op
import sqlalchemy as sa

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None

KINDS = (
    "air_conditioner", "refrigerator", "water_heater", "washing_machine", "tv", "fan",
    "lighting", "computer", "microwave", "pool_pump", "other",
)
ICONS = (
    "snowflake", "refrigerator", "flame", "washing-machine", "tv", "fan",
    "lightbulb", "laptop", "microwave", "waves", "plug",
)


def upgrade():
    op.add_column("equipment", sa.Column("kind", sa.String(20), nullable=False, server_default="other"))
    op.add_column("equipment", sa.Column("brand", sa.String(60)))
    op.add_column("equipment", sa.Column("model", sa.String(60)))
    op.add_column("equipment", sa.Column("icon", sa.String(20)))
    op.create_check_constraint("ck_equipment_kind", "equipment", "kind IN (" + ", ".join(f"'{k}'" for k in KINDS) + ")")
    op.create_check_constraint(
        "ck_equipment_icon", "equipment", "icon IS NULL OR icon IN (" + ", ".join(f"'{i}'" for i in ICONS) + ")"
    )


def downgrade():
    op.drop_constraint("ck_equipment_icon", "equipment", type_="check")
    op.drop_constraint("ck_equipment_kind", "equipment", type_="check")
    for col in ("icon", "model", "brand", "kind"):
        op.drop_column("equipment", col)
