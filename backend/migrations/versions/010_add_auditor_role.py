"""add AUDITOR to userrole enum + seed its role_permissions rows.

Revision ID: 010
Revises: 009
Create Date: 2026-10-08

AUDITOR is read-only: platform:stats, users:read, merchants:read,
transactions:read-all, audit:read. Follows the 008 pattern — Postgres
allows ADD VALUE inside a transaction since PG12.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "010"
down_revision: Union[str, None] = "009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_AUDITOR_PERMISSIONS = (
    "platform:stats",
    "users:read",
    "merchants:read",
    "transactions:read-all",
    "audit:read",
)


def upgrade() -> None:
    op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'AUDITOR'")
    values = ", ".join(f"('AUDITOR', '{p}')" for p in _AUDITOR_PERMISSIONS)
    op.execute(sa.text(f"INSERT INTO role_permissions (role, permission) VALUES {values}"))


def downgrade() -> None:
    # Postgres cannot drop a single enum value; AUDITOR is left defined.
    op.execute(sa.text("DELETE FROM role_permissions WHERE role = 'AUDITOR'"))
