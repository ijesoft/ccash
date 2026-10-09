"""seed audit:export for AUDITOR role.

Revision ID: 011
Revises: 010
Create Date: 2026-10-09

Grants AUDITOR the audit:export permission (in addition to the five rows
from 010). SUPER_ADMIN is synthesized at runtime and never stored in
role_permissions, so no row is needed for it; ADMIN is intentionally
excluded (ADMIN rows come from 009 and carry no audit:* permissions).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "011"
down_revision: Union[str, None] = "010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text(
            "INSERT INTO role_permissions (role, permission) "
            "VALUES ('AUDITOR', 'audit:export')"
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "DELETE FROM role_permissions "
            "WHERE role = 'AUDITOR' AND permission = 'audit:export'"
        )
    )
