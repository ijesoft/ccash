"""add SUPER_ADMIN to userrole enum

Revision ID: 008
Revises: 007
Create Date: 2026-10-01

SUPER_ADMIN is the developer/owner role: full permissions, no wallet,
exclusive /super-admin dashboard. Follows the 006 pattern — Postgres
allows ADD VALUE inside a transaction since PG12.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'SUPER_ADMIN'")


def downgrade() -> None:
    # Postgres cannot drop a single enum value; SUPER_ADMIN is left defined.
    # Reassign any SUPER_ADMIN rows to ADMIN before downgrading.
    pass
