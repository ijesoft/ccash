import uuid

from argon2 import PasswordHasher
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, ValidationError, WalletNotActiveError
from app.domains.wallets.models import Favorite, Wallet, WalletStatus
from app.domains.wallets.repository import WalletRepository

ph = PasswordHasher()


class WalletService:
    def __init__(self, session: AsyncSession):
        self.repo = WalletRepository(session)
        self.session = session

    async def get_or_create_wallet(self, user_id: uuid.UUID) -> Wallet:
        wallet = await self.repo.get_by_user_id(user_id)
        if not wallet:
            wallet = await self.repo.create(user_id)
            await self.session.commit()
        return wallet

    async def get_wallet(self, user_id: uuid.UUID) -> Wallet:
        wallet = await self.repo.get_by_user_id(user_id)
        if not wallet:
            raise NotFoundError("Wallet not found")
        return wallet

    async def set_pin(self, user_id: uuid.UUID, pin: str) -> Wallet:
        wallet = await self.get_or_create_wallet(user_id)
        if len(pin) < 4 or len(pin) > 6:
            raise ValidationError("PIN must be 4-6 digits")
        wallet.pin_hash = ph.hash(pin)
        wallet = await self.repo.update(wallet)
        await self.session.commit()
        return wallet

    async def verify_pin(self, user_id: uuid.UUID, pin: str) -> bool:
        wallet = await self.get_or_create_wallet(user_id)
        if not wallet.pin_hash:
            raise ValidationError("PIN not set")
        try:
            return ph.verify(wallet.pin_hash, pin)
        except Exception:
            return False

    async def freeze_wallet(self, user_id: uuid.UUID) -> Wallet:
        wallet = await self.get_or_create_wallet(user_id)
        wallet.status = WalletStatus.FROZEN
        wallet = await self.repo.update(wallet)
        await self.session.commit()
        return wallet

    async def get_favorites(self, user_id: uuid.UUID) -> list[Favorite]:
        return await self.repo.get_favorites(user_id)

    async def add_favorite(self, user_id: uuid.UUID, name: str, account_identifier: str) -> Favorite:
        fav = await self.repo.add_favorite(user_id, name, account_identifier)
        await self.session.commit()
        return fav

    async def remove_favorite(self, fav_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        result = await self.repo.remove_favorite(fav_id, user_id)
        await self.session.commit()
        return result