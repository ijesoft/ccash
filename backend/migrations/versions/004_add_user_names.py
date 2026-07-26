"""add first_name and last_name to users

Revision ID: 004
Revises: 003
Create Date: 2026-07-26

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("first_name", sa.String(length=100), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("last_name", sa.String(length=100), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "last_name")
    op.drop_column("users", "first_name")