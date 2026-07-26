import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Enum, func
from sqlmodel import Field, SQLModel


class DocumentType(str, enum.Enum):
    ID = "ID"
    SELFIE = "SELFIE"
    PROOF_OF_ADDRESS = "PROOF_OF_ADDRESS"


class KycDocumentStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class KycDocument(SQLModel, table=True):
    __tablename__ = "kyc_documents"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    document_type: DocumentType = Field(sa_type=Enum(DocumentType))
    file_path: str = Field(max_length=500)
    status: KycDocumentStatus = Field(default=KycDocumentStatus.PENDING, sa_type=Enum(KycDocumentStatus))
    rejection_reason: str | None = Field(default=None, max_length=500)

    uploaded_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_type=DateTime(timezone=True),
        sa_column_kwargs={"server_default": func.now()},
    )
    reviewed_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    reviewed_by: uuid.UUID | None = Field(default=None, foreign_key="users.id")