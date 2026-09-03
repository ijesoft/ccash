import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.auth.models import User


class UserRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, user_id: uuid.UUID) -> User | None:
        result = await self.session.execute(select(User).where(User.id == user_id, User.deleted_at.is_(None)))
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> User | None:
        result = await self.session.execute(select(User).where(User.email == email, User.deleted_at.is_(None)))
        return result.scalar_one_or_none()

    async def get_by_phone(self, phone: str) -> User | None:
        from app.core.masking import normalize_philippine_mobile

        norm = normalize_philippine_mobile(phone)
        result = await self.session.execute(
            select(User).where(
                (User.phone == phone) | (User.phone == norm),
                User.deleted_at.is_(None),
            )
        )
        return result.scalar_one_or_none()

    async def create(self, email: str, phone: str, password_hash: str, first_name: str | None = None, last_name: str | None = None) -> User:
        user = User(email=email, phone=phone, password_hash=password_hash, first_name=first_name, last_name=last_name)
        self.session.add(user)
        await self.session.flush()
        return user

    async def update(self, user: User) -> User:
        user.version += 1
        self.session.add(user)
        await self.session.flush()
        return user