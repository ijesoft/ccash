"""add role column to users (RBAC)

Revision ID: 005
Revises: 004
Create Date: 2026-08-19

The seed (app/seed.py) defines admin@ccash.ph as the platform admin, so the
data step promotes that email. On fresh installs the column default handles it.

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Postgres enum types are only auto-created when defined inside a CREATE
    # TABLE. Adding an enum column to an existing table requires creating the
    # type first, so do it explicitly (guarded for idempotency).
    op.execute(
        "DO $$ BEGIN "
        "IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'userrole') THEN "
        "CREATE TYPE userrole AS ENUM ('USER', 'ADMIN'); "
        "END IF; END $$;"
    )
    op.add_column(
        "users",
        sa.Column(
            "role",
            sa.Enum("USER", "ADMIN", name="userrole"),
            nullable=False,
            server_default="USER",
        ),
    )
    op.execute(
        "UPDATE users SET role = 'ADMIN' WHERE email = 'admin@ccash.ph' AND deleted_at IS NULL"
    )


def downgrade() -> None:
    op.drop_column("users", "role")
    op.execute("DROP TYPE IF EXISTS userrole")
