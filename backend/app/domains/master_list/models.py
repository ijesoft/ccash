import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum, func
from sqlmodel import Field, SQLModel


class MasterListStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"


class MasterListEntry(SQLModel, table=True):
    """Standalone admin roster row. Not a login account: no password, no
    wallet, no role. Uniqueness mirrors Member rules (id_no, email, mobile)."""

    __tablename__ = "master_list_entries"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    id_no: str = Field(unique=True, index=True, max_length=9)
    last_name: str = Field(max_length=100)
    first_name: str = Field(max_length=100)
    middle_name: str | None = Field(default=None, max_length=100)
    mobile_number: str = Field(unique=True, index=True, max_length=20)
    email: str = Field(unique=True, index=True, max_length=255)
    status: MasterListStatus = Field(default=MasterListStatus.ACTIVE, sa_type=Enum(MasterListStatus))

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
