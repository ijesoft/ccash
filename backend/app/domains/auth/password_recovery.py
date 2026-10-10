"""Admin-approved password recovery: request rows + single-use codes.

Codes are 8-char secrets shown ONCE to the approving admin (relayed
externally); only the Argon2 hash is stored. Single-use is enforced by the
status transition approved -> processed inside the consume transaction.
"""

import enum
import uuid
from datetime import datetime, timezone

import sqlalchemy as sa
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import Field, SQLModel

from app.core.audit import AuditLog
from app.core.errors import NotFoundError, ValidationError
from app.core.security import generate_recovery_code, hash_password, verify_password
from app.domains.auth.models import User, UserRole
from app.domains.auth.repository import UserRepository

RECOVERY_CODE_TTL_HOURS = 1
OPEN_STATUSES = ("pending", "approved")


class RecoveryStatus(str, enum.Enum):
    PENDING = "pending"
    CANCELLED = "cancelled"
    APPROVED = "approved"
    PROCESSED = "processed"


class PasswordResetRequest(SQLModel, table=True):
    __tablename__ = "password_reset_requests"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    code_hash: str | None = Field(default=None, max_length=255)
    status: str = Field(default=RecoveryStatus.PENDING.value, max_length=20)
    requested_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    decided_at: datetime | None = Field(default=None)
    decided_by_admin_id: uuid.UUID | None = Field(default=None, foreign_key="users.id")
    used_at: datetime | None = Field(default=None)
    expires_at: datetime | None = Field(default=None)
    deleted_at: datetime | None = Field(default=None)
    version: int = Field(default=1)


class RecoveryService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.users = UserRepository(session)

    async def submit_request(self, email: str) -> PasswordResetRequest:
        user = await self.users.get_by_email(email)
        if not user:
            raise ValidationError("Account not found")
        # Auto-cancel prior open rows (new submit supersedes).
        prior = (
            await self.session.execute(
                select(PasswordResetRequest).where(
                    PasswordResetRequest.user_id == user.id,
                    PasswordResetRequest.status.in_(OPEN_STATUSES),
                    PasswordResetRequest.deleted_at.is_(None),
                )
            )
        ).scalars().all()
        for row in prior:
            old_status = row.status
            row.status = RecoveryStatus.CANCELLED.value
            self.session.add(
                AuditLog(
                    user_id=user.id,
                    action="password_recovery.cancel",
                    resource_type="password_reset_request",
                    resource_id=str(row.id),
                    old_values={"status": old_status},
                    new_values={"status": "cancelled", "reason": "superseded"},
                )
            )
        req = PasswordResetRequest(user_id=user.id)
        self.session.add(req)
        self.session.add(
            AuditLog(
                user_id=user.id,
                action="password_recovery.request",
                resource_type="password_reset_request",
                resource_id=str(req.id),
                new_values={"email": email},
            )
        )
        await self.session.commit()
        return req

    async def consume_code(self, code: str, new_password: str) -> PasswordResetRequest:
        if len(new_password) < 8:
            raise ValidationError("Password must be at least 8 characters")
        if len(new_password) > 128:
            raise ValidationError("Password must be at most 128 characters")
        now = datetime.now(timezone.utc)
        candidates = (
            await self.session.execute(
                select(PasswordResetRequest).where(
                    PasswordResetRequest.status == RecoveryStatus.APPROVED.value,
                    PasswordResetRequest.deleted_at.is_(None),
                )
            )
        ).scalars().all()
        match = None
        for row in candidates:
            if row.code_hash and row.expires_at and row.expires_at > now and verify_password(code, row.code_hash):
                match = row
                break
        if match is None:
            self.session.add(
                AuditLog(
                    action="password_recovery.consume_failed",
                    resource_type="password_reset_request",
                    new_values={"reason": "invalid-or-expired-code"},
                )
            )
            await self.session.commit()
            raise ValidationError("Invalid or expired recovery code")
        user = await self.users.get_by_id(match.user_id)
        if not user:
            raise NotFoundError("Account not found")
        user.password_hash = hash_password(new_password)
        match.status = RecoveryStatus.PROCESSED.value
        match.used_at = now
        self.session.add(
            AuditLog(
                user_id=user.id,
                action="password_recovery.consume",
                resource_type="password_reset_request",
                resource_id=str(match.id),
                new_values={"status": "processed"},
            )
        )
        await self.session.commit()
        return match
