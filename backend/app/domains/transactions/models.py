import enum
import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import Column, DateTime, Enum, func
from sqlmodel import Field, SQLModel


class TransactionType(str, enum.Enum):
    CASH_IN = "CASH_IN"
    CASH_OUT = "CASH_OUT"
    SEND = "SEND"
    RECEIVE = "RECEIVE"
    QR_PAYMENT = "QR_PAYMENT"


class TransactionStatus(str, enum.Enum):
    PENDING = "PENDING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    REVERSED = "REVERSED"


class Transaction(SQLModel, table=True):
    __tablename__ = "transactions"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    idempotency_key: str = Field(unique=True, index=True, max_length=255)
    type: TransactionType = Field(sa_type=Enum(TransactionType))
    status: TransactionStatus = Field(default=TransactionStatus.PENDING, sa_type=Enum(TransactionStatus))
    sender_wallet_id: uuid.UUID | None = Field(default=None, foreign_key="wallets.id", index=True)
    receiver_wallet_id: uuid.UUID | None = Field(default=None, foreign_key="wallets.id", index=True)
    amount_cents: int = Field(ge=0)
    fee_cents: int = Field(default=0, ge=0)
    net_amount_cents: int = Field(ge=0)
    reference: str | None = Field(default=None, max_length=255)
    description: str | None = Field(default=None, max_length=500)
    metadata: dict | None = Field(default=None, sa_type=sa.JSON)

    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        sa_type=DateTime(timezone=True),
        sa_column_kwargs={"server_default": func.now()},
    )
    updated_at: datetime = Field(
        default_factory=datetime.utcnow,
        sa_type=DateTime(timezone=True),
        sa_column_kwargs={"onupdate": func.now()},
    )
    created_by: uuid.UUID | None = Field(default=None, foreign_key="users.id")