"""password recovery request table + recover-password grant for ADMIN.

Revision ID: 012
Revises: 011
Create Date: 2026-10-10

New `password_reset_requests` table backing the admin-approved recovery
flow (RecoveryService in app/domains/auth/password_recovery.py), plus the
('ADMIN', 'users:recover-password') seed row. SUPER_ADMIN needs no row
(synthesized at runtime); AUDITOR is intentionally excluded.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "012"
down_revision: Union[str, None] = "011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "password_reset_requests",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("code_hash", sa.String(255), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decided_by_admin_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_password_reset_requests_user_id", "password_reset_requests", ["user_id"])
    op.execute(sa.text("INSERT INTO role_permissions (role, permission) VALUES ('ADMIN', 'users:recover-password')"))


def downgrade() -> None:
    op.execute(
        sa.text(
            "DELETE FROM role_permissions "
            "WHERE role = 'ADMIN' AND permission = 'users:recover-password'"
        )
    )
    op.drop_index("ix_password_reset_requests_user_id", table_name="password_reset_requests")
    op.drop_table("password_reset_requests")
