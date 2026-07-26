import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Enum, func
from sqlmodel import Field, SQLModel


class UserStatus(str, enum.Enum):
    PENDING = "PENDING"
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"


class KycLevel(str, enum.Enum):
    NONE = "NONE"
    BASIC = "BASIC"
    FULL = "FULL"


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    email: str = Field(unique=True, index=True, max_length=255)
    phone: str = Field(unique=True, index=True, max_length=20)
    first_name: str | None = Field(default=None, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)
    password_hash: str = Field(max_length=255)
    status: UserStatus = Field(default=UserStatus.PENDING, sa_type=Enum(UserStatus))
    kyc_level: KycLevel = Field(default=KycLevel.NONE, sa_type=Enum(KycLevel))
    device_id: str | None = Field(default=None, max_length=255)
    totp_secret: str | None = Field(default=None, max_length=255)
    is_2fa_enabled: bool = Field(default=False)
    is_verified: bool = Field(default=False)

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
    deleted_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    version: int = Field(default=1)

    created_by: uuid.UUID | None = Field(default=None, foreign_key="users.id")
    updated_by: uuid.UUID | None = Field(default=None, foreign_key="users.id")