import uuid
from collections.abc import Collection

from argon2 import PasswordHasher
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.auth.models import User
from app.domains.wallets.models import Favorite, Wallet, WalletStatus

ph = PasswordHasher()


class WalletRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_owners_by_wallet_ids(
        self, wallet_ids: Collection[uuid.UUID]
    ) -> dict[uuid.UUID, User]:
        """Batch-resolve wallet -> owning user, for counterparty labels.

        Batched so rendering a page of transactions stays a single query.
        """
        if not wallet_ids:
            return {}

        result = await self.session.execute(
            select(Wallet.id, User)
            .join(User, User.id == Wallet.user_id)
            .where(Wallet.id.in_(wallet_ids), Wallet.deleted_at.is_(None))
        )
        return {wallet_id: user for wallet_id, user in result.all()}

    async def get_by_user_id(self, user_id: uuid.UUID) -> Wallet | None:
        result = await self.session.execute(
            select(Wallet).where(Wallet.user_id == user_id, Wallet.deleted_at.is_(None))
        )
        return result.scalar_one_or_none()

    async def get_for_update(self, wallet_id: uuid.UUID) -> Wallet | None:
        result = await self.session.execute(
            select(Wallet)
            .where(Wallet.id == wallet_id, Wallet.deleted_at.is_(None))
            .with_for_update()
        )
        return result.scalar_one_or_none()

    async def get_by_id(self, wallet_id: uuid.UUID) -> Wallet | None:
        result = await self.session.execute(
            select(Wallet).where(Wallet.id == wallet_id, Wallet.deleted_at.is_(None))
        )
        return result.scalar_one_or_none()

    async def create(self, user_id: uuid.UUID) -> Wallet:
        wallet = Wallet(user_id=user_id)
        self.session.add(wallet)
        await self.session.flush()
        return wallet

    async def update_balance(self, wallet_id: uuid.UUID, amount_cents: int) -> None:
        await self.session.execute(
            update(Wallet)
            .where(Wallet.id == wallet_id, Wallet.deleted_at.is_(None))
            .values(balance_cents=Wallet.balance_cents + amount_cents, version=Wallet.version + 1)
        )

    async def update_daily_usage(self, wallet_id: uuid.UUID, amount_cents: int) -> None:
        await self.session.execute(
            update(Wallet)
            .where(Wallet.id == wallet_id)
            .values(daily_send_used_cents=Wallet.daily_send_used_cents + amount_cents, version=Wallet.version + 1)
        )

    async def update(self, wallet: Wallet) -> Wallet:
        wallet.version += 1
        self.session.add(wallet)
        await self.session.flush()
        return wallet

    async def verify_pin_for_user(self, wallet_id: uuid.UUID, pin: str) -> bool:
        result = await self.session.execute(
            select(Wallet).where(Wallet.id == wallet_id, Wallet.deleted_at.is_(None))
        )
        wallet = result.scalar_one_or_none()
        if not wallet or not wallet.pin_hash:
            return False
        try:
            return ph.verify(wallet.pin_hash, pin)
        except Exception:
            return False

    async def get_favorites(self, user_id: uuid.UUID) -> list[Favorite]:
        result = await self.session.execute(
            select(Favorite).where(Favorite.user_id == user_id).order_by(Favorite.created_at.desc())
        )
        return list(result.scalars().all())

    async def add_favorite(self, user_id: uuid.UUID, name: str, account_identifier: str) -> Favorite:
        fav = Favorite(user_id=user_id, name=name, account_identifier=account_identifier)
        self.session.add(fav)
        await self.session.flush()
        return fav

    async def remove_favorite(self, fav_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        result = await self.session.execute(
            select(Favorite).where(Favorite.id == fav_id, Favorite.user_id == user_id)
        )
        fav = result.scalar_one_or_none()
        if fav:
            await self.session.delete(fav)
            await self.session.flush()
            return True
        return False