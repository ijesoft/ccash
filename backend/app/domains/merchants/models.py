import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, func
from sqlmodel import Field, SQLModel


class MerchantProfile(SQLModel, table=True):
    """Merchant-specific fields, 1:1 with a `users` row (role=MERCHANT).

    The merchant's login/email/phone/password live on `User`; everything a
    merchant fills in on the Merchant Sign-Up form that a Member does not
    (company name, TIN, etc.) lives here instead of as nullable columns on
    the shared `users` table.
    """

    __tablename__ = "merchant_profiles"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", unique=True, index=True)

    # "M" + 9 digits. Auto-generated for outsider merchants (e.g. Abenson);
    # can be supplied by admin when the merchant already has an assigned number.
    merchant_id_no: str = Field(unique=True, index=True, max_length=10)
    company_name: str = Field(max_length=255)
    contact_person: str = Field(max_length=255)
    mobile_no: str = Field(max_length=20)
    landline: str | None = Field(default=None, max_length=20)
    address: str = Field(max_length=500)
    tin: str = Field(max_length=20)

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
