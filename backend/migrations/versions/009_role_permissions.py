"""role_permissions mapping table seeded from ROLE_PERMISSIONS constants.

Revision ID: 009
Revises: 008
Create Date: 2026-10-01

One row per granted permission, e.g. ('ADMIN', 'users:read'). No row means
denied. SUPER_ADMIN gets no rows: it is synthesized as "all permissions" in
code (see RolePermissionService.get_matrix). MEMBER/MERCHANT start empty.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "009"
down_revision: Union[str, None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_ADMIN_PERMISSIONS = (
    "platform:stats",
    "users:read",
    "users:create",
    "users:update",
    "users:suspend",
    "users:delete",
    "users:reset-password",
    "users:change-role",
    "users:set-id",
    "merchants:read",
    "merchants:update",
    "merchants:set-id",
    "transactions:read-all",
    "cash:operate",
    "reports:export",
    "masterlist:read",
    "masterlist:write",
    "branding:write",
    "kyc:review",
)


def upgrade() -> None:
    op.create_table(
        "role_permissions",
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("permission", sa.String(length=64), nullable=False),
        sa.PrimaryKeyConstraint("role", "permission"),
    )
    values = ", ".join(f"('ADMIN', '{p}')" for p in _ADMIN_PERMISSIONS)
    op.execute(sa.text(f"INSERT INTO role_permissions (role, permission) VALUES {values}"))


def downgrade() -> None:
    op.drop_table("role_permissions")
