import enum
import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import Column, DateTime, func
from sqlmodel import Field, SQLModel


class NotificationType(str, enum.Enum):
    TRANSFER_RECEIVED = "TRANSFER_RECEIVED"
    CASH_IN = "CASH_IN"
    CASH_OUT = "CASH_OUT"
    SENT = "SENT"
    QR_PAYMENT = "QR_PAYMENT"
    KYC_UPDATE = "KYC_UPDATE"
    SECURITY = "SECURITY"


class Notification(SQLModel, table=True):
    __tablename__ = "notifications"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    type: NotificationType = Field()
    title: str = Field(max_length=255)
    body: str = Field(max_length=1000)
    is_read: bool = Field(default=False)
    data: dict | None = Field(default=None, sa_type=sa.JSON)

    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        sa_type=DateTime(timezone=True),
        sa_column_kwargs={"server_default": func.now()},
    )