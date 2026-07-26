"""initial migration

Revision ID: 001
Revises:
Create Date: 2026-07-23

"""

from typing import Sequence, Union

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("phone", sa.String(length=20), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("status", sa.Enum("PENDING", "ACTIVE", "SUSPENDED", name="userstatus"), nullable=False),
        sa.Column("kyc_level", sa.Enum("NONE", "BASIC", "FULL", name="kyclevel"), nullable=False),
        sa.Column("device_id", sa.String(length=255), nullable=True),
        sa.Column("totp_secret", sa.String(length=255), nullable=True),
        sa.Column("is_2fa_enabled", sa.Boolean(), nullable=False),
        sa.Column("is_verified", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_phone", "users", ["phone"], unique=True)

    op.create_table(
        "wallets",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("balance_cents", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="PHP"),
        sa.Column("status", sa.Enum("ACTIVE", "FROZEN", "CLOSED", name="walletstatus"), nullable=False),
        sa.Column("pin_hash", sa.String(length=255), nullable=True),
        sa.Column("daily_send_limit_cents", sa.BigInteger(), nullable=False, server_default="5000000"),
        sa.Column("daily_send_used_cents", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"],),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_wallets_user_id", "wallets", ["user_id"])

    op.create_table(
        "transactions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("idempotency_key", sa.String(length=255), nullable=False),
        sa.Column("type", sa.Enum("CASH_IN", "CASH_OUT", "SEND", "RECEIVE", "QR_PAYMENT", name="transactiontype"), nullable=False),
        sa.Column("status", sa.Enum("PENDING", "SUCCESS", "FAILED", "REVERSED", name="transactionstatus"), nullable=False),
        sa.Column("sender_wallet_id", sa.Uuid(), nullable=True),
        sa.Column("receiver_wallet_id", sa.Uuid(), nullable=True),
        sa.Column("amount_cents", sa.BigInteger(), nullable=False),
        sa.Column("fee_cents", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("net_amount_cents", sa.BigInteger(), nullable=False),
        sa.Column("reference", sa.String(length=255), nullable=True),
        sa.Column("description", sa.String(length=500), nullable=True),
        # Must match Transaction.tx_metadata: `metadata` is reserved on
        # SQLAlchemy declarative classes, so the model cannot use that name. A
        # database built from this migration with the column named `metadata`
        # cannot read the transactions table at all.
        sa.Column("tx_metadata", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(["sender_wallet_id"], ["wallets.id"],),
        sa.ForeignKeyConstraint(["receiver_wallet_id"], ["wallets.id"],),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"],),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_transactions_idempotency_key", "transactions", ["idempotency_key"], unique=True)
    op.create_index("ix_transactions_sender_wallet_id", "transactions", ["sender_wallet_id"])
    op.create_index("ix_transactions_receiver_wallet_id", "transactions", ["receiver_wallet_id"])

    op.create_table(
        "favorites",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("account_identifier", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"],),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_favorites_user_id", "favorites", ["user_id"])

    op.create_table(
        "notifications",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        # Must be the enum type, not VARCHAR: Notification.type is a
        # NotificationType enum, so SQLAlchemy binds inserts as
        # ::notificationtype and a VARCHAR column makes every insert fail.
        sa.Column(
            "type",
            sa.Enum(
                "TRANSFER_RECEIVED",
                "CASH_IN",
                "CASH_OUT",
                "SENT",
                "QR_PAYMENT",
                "KYC_UPDATE",
                "SECURITY",
                name="notificationtype",
            ),
            nullable=False,
        ),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("body", sa.String(length=1000), nullable=False),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default="false"),
        # Matches Notification.data, for the same reason as above.
        sa.Column("data", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"],),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notifications_user_id", "notifications", ["user_id"])

    op.create_table(
        "kyc_documents",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("document_type", sa.Enum("ID", "SELFIE", "PROOF_OF_ADDRESS", name="documenttype"), nullable=False),
        sa.Column("file_path", sa.String(length=500), nullable=False),
        sa.Column("status", sa.Enum("PENDING", "APPROVED", "REJECTED", name="kycdocumentstatus"), nullable=False),
        sa.Column("rejection_reason", sa.String(length=500), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewed_by", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"],),
        sa.ForeignKeyConstraint(["reviewed_by"], ["users.id"],),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_kyc_documents_user_id", "kyc_documents", ["user_id"])

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("action", sa.String(length=255), nullable=False),
        sa.Column("resource_type", sa.String(length=255), nullable=False),
        sa.Column("resource_id", sa.String(length=255), nullable=True),
        sa.Column("old_values", sa.JSON(), nullable=True),
        sa.Column("new_values", sa.JSON(), nullable=True),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("user_agent", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"],),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_logs_user_id", "audit_logs", ["user_id"])


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("kyc_documents")
    op.drop_table("notifications")
    op.drop_table("favorites")
    op.drop_table("transactions")
    op.drop_table("wallets")
    op.drop_table("users")

    op.execute("DROP TYPE IF EXISTS userstatus")
    op.execute("DROP TYPE IF EXISTS kyclevel")
    op.execute("DROP TYPE IF EXISTS walletstatus")
    op.execute("DROP TYPE IF EXISTS transactiontype")
    op.execute("DROP TYPE IF EXISTS transactionstatus")
    op.execute("DROP TYPE IF EXISTS documenttype")
    op.execute("DROP TYPE IF EXISTS kycdocumentstatus")