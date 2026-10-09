"""Idempotent auditor seed for live DBs: inserts auditor@ccash.ph only if missing.

Unlike app.seed (full fixture set, unique-constraint-unsafe on existing DBs),
this script is safe to re-run. No wallet is created (auditors are wallet-less,
like SUPER_ADMIN).
"""

import asyncio
import uuid

from sqlalchemy import select

from app.core.security import hash_password
from app.database import async_session_factory
from app.domains.auth.models import User, UserRole, UserStatus

EMAIL = "auditor@ccash.ph"
PHONE = "09180000006"
ID_NO = "000000006"
PASSWORD = "Auditor123!"


async def main() -> None:
    async with async_session_factory() as session:
        existing = (
            await session.execute(select(User).where(User.email == EMAIL))
        ).scalar_one_or_none()
        if existing is not None:
            print(f"already exists: {EMAIL} ({existing.role.value}, {existing.status.value})")
            return
        user = User(
            id=uuid.uuid4(),
            email=EMAIL,
            phone=PHONE,
            id_no=ID_NO,
            first_name="Audit",
            last_name="Or",
            password_hash=hash_password(PASSWORD),
            status=UserStatus.ACTIVE,
            is_verified=True,
            role=UserRole.AUDITOR,
        )
        session.add(user)
        await session.commit()
        print(f"created: {EMAIL} / {PASSWORD} (no wallet)")


if __name__ == "__main__":
    asyncio.run(main())
