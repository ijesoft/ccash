"""master list roster: standalone admin table with unique 9-digit ID.

Revision ID: 007
Revises: 006
Create Date: 2026-09-21
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "master_list_entries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("id_no", sa.String(length=9), nullable=False),
        sa.Column("last_name", sa.String(length=100), nullable=False),
        sa.Column("first_name", sa.String(length=100), nullable=False),
        sa.Column("middle_name", sa.String(length=100), nullable=True),
        sa.Column("mobile_number", sa.String(length=20), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("status", sa.Enum("ACTIVE", "INACTIVE", name="masterliststatus"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_master_list_entries_id_no", "master_list_entries", ["id_no"], unique=True)
    op.create_index("ix_master_list_entries_email", "master_list_entries", ["email"], unique=True)
    op.create_index(
        "ix_master_list_entries_mobile_number", "master_list_entries", ["mobile_number"], unique=True
    )


def downgrade() -> None:
    op.drop_index("ix_master_list_entries_mobile_number", table_name="master_list_entries")
    op.drop_index("ix_master_list_entries_email", table_name="master_list_entries")
    op.drop_index("ix_master_list_entries_id_no", table_name="master_list_entries")
    op.drop_table("master_list_entries")
    # masterliststatus enum type is left defined (same as MERCHANT in 006):
    # Postgres cannot drop an enum value inside a downgrade cleanly, and no
    # other table uses it, so leaving it is harmless.
