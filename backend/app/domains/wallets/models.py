import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Enum, func
from sqlmodel import Field, SQLModel


class WalletStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    FROZEN = "FROZEN"
    CLOSED = "CLOSED"


class Wallet(SQLModel, table=True):
    __tablename__ = "wallets"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    balance_cents: int = Field(default=0, ge=0)
    currency: str = Field(default="PHP", max_length=3)
    status: WalletStatus = Field(default=WalletStatus.ACTIVE, sa_type=Enum(WalletStatus))
    pin_hash: str | None = Field(default=None, max_length=255)
    daily_send_limit_cents: int = Field(default=5000000)
    daily_send_used_cents: int = Field(default=0)

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
    deleted_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    version: int = Field(default=1)


class Favorite(SQLModel, table=True):
    __tablename__ = "favorites"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    name: str = Field(max_length=255)
    account_identifier: str = Field(max_length=255)

    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        sa_type=DateTime(timezone=True),
        sa_column_kwargs={"server_default": func.now()},
    )