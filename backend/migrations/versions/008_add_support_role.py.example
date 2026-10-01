"""EXAMPLE ONLY — how to add a role (e.g. SUPPORT). Do not apply as-is.

Steps to add a real role:
1. Add SUPPORT to UserRole in backend/app/domains/auth/models.py and to
   UserRoleEnum in backend/app/domains/admin/graphql.py.
2. Add UserRole.SUPPORT entry to ROLE_PERMISSIONS in backend/app/core/rbac.py.
3. Copy this file to 008_add_support_role.py (drop _EXAMPLE), run
   `cd backend && ./.venv/bin/python -m alembic -c migrations/alembic.ini upgrade head`.
4. No resolver changes needed if they use require_perms().

Revision ID: 008
Revises: 007
"""

revision: str = "008"
down_revision = "007"

from alembic import op


def upgrade() -> None:
    op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'SUPPORT'")


def downgrade() -> None:
    pass  # Postgres cannot drop an enum value; leave it defined.
