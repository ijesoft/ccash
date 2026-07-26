import enum
import uuid
from datetime import datetime, timezone

import sqlalchemy as sa
from sqlalchemy import BigInteger, Column, DateTime, Enum, func
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
    # NOTE: no ``ge=`` here. Pydantic constraints on a SQLModel ``table=True``
    # model are column metadata only and are never validated at runtime, which
    # is how negative amounts previously reached update_balance() and reversed
    # the direction of a transfer. Amounts are validated in
    # transactions.policy.validate_amount and backstopped by DB CHECK
    # constraints (migration 002).
    # BigInteger, not the default INTEGER: a plain `int` field caps a money
    # column at 2,147,483,647 cents (PHP 21,474,836.47).
    amount_cents: int = Field(sa_type=BigInteger)
    fee_cents: int = Field(default=0, sa_type=BigInteger)
    net_amount_cents: int = Field(sa_type=BigInteger)
    reference: str | None = Field(default=None, unique=True, index=True, max_length=255)
    description: str | None = Field(default=None, max_length=500)
    tx_metadata: dict | None = Field(default=None, sa_type=sa.JSON)

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_type=DateTime(timezone=True),
        sa_column_kwargs={"server_default": func.now()},
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_type=DateTime(timezone=True),
        sa_column_kwargs={"onupdate": func.now()},
    )
    created_by: uuid.UUID | None = Field(default=None, foreign_key="users.id")