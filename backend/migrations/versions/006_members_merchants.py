"""members + merchants: id_no/middle_name, MEMBER/MERCHANT roles, merchant_profiles

Revision ID: 006
Revises: 005
Create Date: 2026-09-18

Client requirements: Member sign-up needs a 9-digit employee ID and a middle
name; Merchant sign-up is a new account type ("M" + 9-digit ID) with its own
fields (company, contact person, TIN, etc.), 1:1 with a `users` row via
`merchant_profiles`. UserRole.USER is renamed to MEMBER to match the client's
terminology; MERCHANT is added alongside it.

Postgres allows ALTER TYPE ... RENAME VALUE / ADD VALUE inside a transaction
since PG12 (this project runs PG17), so no special transaction handling is
needed here.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("id_no", sa.String(length=9), nullable=True))
    op.create_index("ix_users_id_no", "users", ["id_no"], unique=True)

    op.add_column("users", sa.Column("middle_name", sa.String(length=100), nullable=True))

    op.execute("ALTER TYPE userrole RENAME VALUE 'USER' TO 'MEMBER'")
    op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'MERCHANT'")

    op.create_table(
        "merchant_profiles",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("merchant_id_no", sa.String(length=10), nullable=False),
        sa.Column("company_name", sa.String(length=255), nullable=False),
        sa.Column("contact_person", sa.String(length=255), nullable=False),
        sa.Column("mobile_no", sa.String(length=20), nullable=False),
        sa.Column("landline", sa.String(length=20), nullable=True),
        sa.Column("address", sa.String(length=500), nullable=False),
        sa.Column("tin", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_merchant_profiles_user_id", "merchant_profiles", ["user_id"], unique=True)
    op.create_index("ix_merchant_profiles_merchant_id_no", "merchant_profiles", ["merchant_id_no"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_merchant_profiles_merchant_id_no", table_name="merchant_profiles")
    op.drop_index("ix_merchant_profiles_user_id", table_name="merchant_profiles")
    op.drop_table("merchant_profiles")

    # Postgres cannot drop a single enum value, so MERCHANT is left defined;
    # any MERCHANT rows must be reassigned before downgrading or this fails
    # on the NOT NULL/enum constraint.
    op.execute("ALTER TYPE userrole RENAME VALUE 'MEMBER' TO 'USER'")

    op.drop_column("users", "middle_name")

    op.drop_index("ix_users_id_no", table_name="users")
    op.drop_column("users", "id_no")
