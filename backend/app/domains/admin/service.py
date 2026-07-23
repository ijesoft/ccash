import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.auth.models import User
from app.domains.auth.repository import UserRepository
from app.domains.transactions.models import Transaction, TransactionStatus
from app.domains.wallets.models import Wallet


class AdminService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.user_repo = UserRepository(session)

    async def get_platform_stats(self) -> dict:
        user_count_result = await self.session.execute(select(func.count(User.id)))
        user_count = user_count_result.scalar() or 0

        wallet_count_result = await self.session.execute(select(func.count(Wallet.id)))
        wallet_count = wallet_count_result.scalar() or 0

        tx_count_result = await self.session.execute(select(func.count(Transaction.id)))
        tx_count = tx_count_result.scalar() or 0

        volume_result = await self.session.execute(
            select(func.coalesce(func.sum(Transaction.amount_cents), 0)).where(Transaction.status == TransactionStatus.SUCCESS)
        )
        volume = volume_result.scalar() or 0

        return {
            "total_users": user_count,
            "active_wallets": wallet_count,
            "total_transactions": tx_count,
            "transaction_volume_cents": volume,
        }

    async def list_users(self, limit: int = 20, offset: int = 0) -> tuple[list[User], int]:
        total_result = await self.session.execute(select(func.count(User.id)))
        total = total_result.scalar() or 0

        result = await self.session.execute(
            select(User).order_by(User.created_at.desc()).offset(offset).limit(limit)
        )
        return list(result.scalars().all()), total

    async def suspend_user(self, user_id: uuid.UUID) -> User | None:
        user = await self.user_repo.get_by_id(user_id)
        if user:
            user.status = "SUSPENDED"
            await self.user_repo.update(user)
        return user

    async def activate_user(self, user_id: uuid.UUID) -> User | None:
        user = await self.user_repo.get_by_id(user_id)
        if user:
            user.status = "ACTIVE"
            await self.user_repo.update(user)
        return user