"""credit memo module + role permission grants.

Revision ID: 013
Revises: 012
Create Date: 2026-10-29
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "013"
down_revision: Union[str, None] = "012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_STATUS_VALUES = ("FOR_REVIEW", "CANCELLED", "DECLINED", "APPROVED")
_GRANTS = (
    ("ADMIN", "credit-memo:read"),
    ("ADMIN", "credit-memo:review"),
    ("MERCHANT", "credit-memo:read"),
    ("MERCHANT", "credit-memo:submit"),
)


def upgrade() -> None:
    op.execute("ALTER TYPE transactiontype ADD VALUE IF NOT EXISTS 'CREDIT_MEMO'")
    op.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'CREDIT_MEMO'")
    op.execute(
        """
        DO $$
        BEGIN
            CREATE TYPE creditmemostatus AS ENUM
                ('FOR_REVIEW', 'CANCELLED', 'DECLINED', 'APPROVED');
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END
        $$;
        """
    )

    status_enum = postgresql.ENUM(
        *_STATUS_VALUES, name="creditmemostatus", create_type=False
    )
    op.create_table(
        "credit_memos",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("reference", sa.String(length=32), nullable=False),
        sa.Column("idempotency_key", sa.String(length=255), nullable=False),
        sa.Column("merchant_user_id", sa.Uuid(), nullable=False),
        sa.Column("merchant_wallet_id", sa.Uuid(), nullable=False),
        sa.Column("customer_user_id", sa.Uuid(), nullable=False),
        sa.Column("customer_wallet_id", sa.Uuid(), nullable=False),
        sa.Column("transaction_id", sa.Uuid(), nullable=False),
        sa.Column("amount_cents", sa.BigInteger(), nullable=False),
        sa.Column("reason", sa.String(length=1000), nullable=False),
        sa.Column(
            "status", status_enum, nullable=False, server_default="FOR_REVIEW"
        ),
        sa.Column("admin_note", sa.String(length=1000), nullable=True),
        sa.Column("decided_by", sa.Uuid(), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("refund_transaction_id", sa.Uuid(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.CheckConstraint(
            "amount_cents > 0", name="ck_credit_memos_amount_positive"
        ),
        sa.ForeignKeyConstraint(["merchant_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["merchant_wallet_id"], ["wallets.id"]),
        sa.ForeignKeyConstraint(["customer_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["customer_wallet_id"], ["wallets.id"]),
        sa.ForeignKeyConstraint(["transaction_id"], ["transactions.id"]),
        sa.ForeignKeyConstraint(["decided_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["refund_transaction_id"], ["transactions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_credit_memos_reference", "credit_memos", ["reference"], unique=True
    )
    op.create_index(
        "ix_credit_memos_idempotency_key",
        "credit_memos",
        ["idempotency_key"],
        unique=True,
    )
    op.create_index("ix_credit_memos_status", "credit_memos", ["status"])
    op.create_index(
        "ix_credit_memos_merchant_user_id", "credit_memos", ["merchant_user_id"]
    )
    op.create_index(
        "ix_credit_memos_merchant_wallet_id", "credit_memos", ["merchant_wallet_id"]
    )
    op.create_index(
        "ix_credit_memos_customer_user_id", "credit_memos", ["customer_user_id"]
    )
    op.create_index(
        "ix_credit_memos_customer_wallet_id", "credit_memos", ["customer_wallet_id"]
    )
    op.create_index(
        "ix_credit_memos_transaction_id", "credit_memos", ["transaction_id"]
    )

    values = ", ".join(f"('{role}', '{perm}')" for role, perm in _GRANTS)
    op.execute(
        sa.text(
            "INSERT INTO role_permissions (role, permission) "
            f"VALUES {values} ON CONFLICT (role, permission) DO NOTHING"
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text("DELETE FROM role_permissions WHERE permission LIKE 'credit-memo:%'")
    )
    op.drop_index("ix_credit_memos_transaction_id", table_name="credit_memos")
    op.drop_index("ix_credit_memos_customer_wallet_id", table_name="credit_memos")
    op.drop_index("ix_credit_memos_customer_user_id", table_name="credit_memos")
    op.drop_index("ix_credit_memos_merchant_wallet_id", table_name="credit_memos")
    op.drop_index("ix_credit_memos_merchant_user_id", table_name="credit_memos")
    op.drop_index("ix_credit_memos_status", table_name="credit_memos")
    op.drop_index("ix_credit_memos_idempotency_key", table_name="credit_memos")
    op.drop_index("ix_credit_memos_reference", table_name="credit_memos")
    op.drop_table("credit_memos")
    op.execute("DROP TYPE IF EXISTS creditmemostatus")
    # PostgreSQL cannot remove a single enum value; CREDIT_MEMO stays defined
    # on transactiontype and notificationtype (same precedent as AUDITOR).
