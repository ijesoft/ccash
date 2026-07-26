import uuid
from datetime import datetime, timezone

import sqlalchemy as sa
from sqlalchemy import Column, DateTime, func
from sqlmodel import Field, SQLModel


class AuditLog(SQLModel, table=True):
    __tablename__ = "audit_logs"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID | None = Field(default=None, foreign_key="users.id", index=True)
    action: str = Field(max_length=255)
    resource_type: str = Field(max_length=255)
    resource_id: str | None = Field(default=None, max_length=255)
    old_values: dict | None = Field(default=None, sa_type=sa.JSON)
    new_values: dict | None = Field(default=None, sa_type=sa.JSON)
    ip_address: str | None = Field(default=None, max_length=45)
    user_agent: str | None = Field(default=None, max_length=500)

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_type=DateTime(timezone=True),
        sa_column_kwargs={"server_default": func.now()},
    )