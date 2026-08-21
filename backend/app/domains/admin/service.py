import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import AuditLog
from app.core.errors import NotFoundError, ValidationError
from app.domains.auth.models import User, UserRole, UserStatus
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

    async def list_users(self, limit: int = 20, offset: int = 0) -> tuple[list[dict], int]:
        total_result = await self.session.execute(select(func.count(User.id)))
        total = total_result.scalar() or 0

        result = await self.session.execute(
            select(User, Wallet)
            .outerjoin(Wallet, User.id == Wallet.user_id)
            .order_by(User.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        rows = result.all()
        members = []
        for user, wallet in rows:
            members.append({
                "id": str(user.id),
                "email": user.email,
                "role": user.role.value,
                "status": user.status.value,
                "wallet_balance_cents": wallet.balance_cents if wallet else 0,
                "wallet_status": wallet.status.value if wallet else "NONE",
                "created_at": user.created_at.isoformat() if user.created_at else "",
            })
        return members, total

    async def suspend_user(self, user_id: uuid.UUID) -> User | None:
        user = await self.user_repo.get_by_id(user_id)
        if user:
            user.status = UserStatus.SUSPENDED
            await self.user_repo.update(user)
            await self.session.commit()
        return user

    async def activate_user(self, user_id: uuid.UUID) -> User | None:
        user = await self.user_repo.get_by_id(user_id)
        if user:
            user.status = UserStatus.ACTIVE
            await self.user_repo.update(user)
            await self.session.commit()
        return user

    async def update_user_role(
        self, user_id: uuid.UUID, new_role: UserRole, actor_id: uuid.UUID
    ) -> User:
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User not found")

        # Lockout prevention: never allow the organization's last admin to be
        # demoted. SUSPENDED admins still count — they can be reactivated.
        if user.role == UserRole.ADMIN and new_role != UserRole.ADMIN:
            other_admins = (
                await self.session.execute(
                    select(func.count(User.id)).where(
                        User.role == UserRole.ADMIN,
                        User.deleted_at.is_(None),
                        User.id != user_id,
                    )
                )
            ).scalar() or 0
            if other_admins == 0:
                raise ValidationError("Cannot demote the last admin")

        old_role = user.role.value
        user.role = new_role
        user.updated_by = actor_id
        self.session.add(
            AuditLog(
                user_id=actor_id,
                action="role.change",
                resource_type="user",
                resource_id=str(user_id),
                old_values={"role": old_role},
                new_values={"role": new_role.value},
            )
        )
        await self.user_repo.update(user)
        await self.session.commit()
        return user