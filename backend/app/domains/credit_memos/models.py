"""Merchant-submitted credit memos awaiting admin review."""

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import BigInteger, CheckConstraint, DateTime, Enum, func
from sqlmodel import Field, SQLModel


class CreditMemoStatus(str, enum.Enum):
    FOR_REVIEW = "FOR_REVIEW"
    CANCELLED = "CANCELLED"
    DECLINED = "DECLINED"
    APPROVED = "APPROVED"


class CreditMemo(SQLModel, table=True):
    __tablename__ = "credit_memos"
    __table_args__ = (
        CheckConstraint("amount_cents > 0", name="ck_credit_memos_amount_positive"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    reference: str = Field(unique=True, index=True, max_length=32)
    idempotency_key: str = Field(unique=True, index=True, max_length=255)

    merchant_user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    merchant_wallet_id: uuid.UUID = Field(foreign_key="wallets.id", index=True)
    customer_user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    customer_wallet_id: uuid.UUID = Field(foreign_key="wallets.id", index=True)
    transaction_id: uuid.UUID = Field(foreign_key="transactions.id", index=True)

    amount_cents: int = Field(sa_type=BigInteger)
    reason: str = Field(max_length=1000)
    status: CreditMemoStatus = Field(
        default=CreditMemoStatus.FOR_REVIEW,
        sa_type=Enum(CreditMemoStatus),
        index=True,
        sa_column_kwargs={"server_default": "FOR_REVIEW"},
    )
    admin_note: str | None = Field(default=None, max_length=1000)
    decided_by: uuid.UUID | None = Field(default=None, foreign_key="users.id")
    decided_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    cancelled_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    refund_transaction_id: uuid.UUID | None = Field(
        default=None, foreign_key="transactions.id"
    )

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_type=DateTime(timezone=True),
        sa_column_kwargs={"server_default": func.now()},
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_type=DateTime(timezone=True),
        sa_column_kwargs={"onupdate": func.now(), "server_default": func.now()},
    )
    deleted_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    version: int = Field(default=1, sa_column_kwargs={"server_default": "1"})
