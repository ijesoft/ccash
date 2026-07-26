import uuid

import strawberry
from strawberry.types import Info

from app.core.errors import NotFoundError, ValidationError
from app.core.masking import mask_mobile
from app.database import async_session_factory
from app.domains.auth.repository import UserRepository
from app.domains.auth.models import User
from app.domains.wallets.models import Wallet
from app.domains.wallets.service import WalletService
from app.graphql.middleware import AuthContext
from app.graphql.scalars import Money


@strawberry.type
class RecipientType:
    wallet_id: str
    name: str
    masked_mobile: str

    @classmethod
    def from_user(cls, user: User) -> "RecipientType":
        return cls(
            wallet_id=str(user.id),
            name=f"{user.first_name or ''} {user.last_name or ''}".strip(),
            masked_mobile=mask_mobile(user.phone),
        )


async def get_wallet_service(info: Info) -> WalletService:
    session = async_session_factory()
    return WalletService(session)


@strawberry.type
class WalletType:
    id: str
    user_id: str
    balance: Money
    status: str
    daily_send_limit: Money
    daily_send_used: Money

    @classmethod
    def from_model(cls, wallet: Wallet) -> "WalletType":
        return cls(
            id=str(wallet.id),
            user_id=str(wallet.user_id),
            balance=Money(amount=wallet.balance_cents / 100, cents=wallet.balance_cents),
            status=wallet.status.value,
            daily_send_limit=Money(amount=wallet.daily_send_limit_cents / 100, cents=wallet.daily_send_limit_cents),
            daily_send_used=Money(amount=wallet.daily_send_used_cents / 100, cents=wallet.daily_send_used_cents),
        )


@strawberry.type
class FavoriteType:
    id: str
    name: str
    account_identifier: str


@strawberry.type
class WalletQueries:
    @strawberry.field
    async def wallet(self, info: Info) -> WalletType:
        context: AuthContext = info.context
        if not context.user_id:
            raise Exception("Not authenticated")

        service = await get_wallet_service(info)
        try:
            wallet = await service.get_wallet(context.user_id)
            return WalletType.from_model(wallet)
        except NotFoundError as e:
            raise Exception(str(e))
        finally:
            await service.session.close()

    @strawberry.field
    async def favorites(self, info: Info) -> list[FavoriteType]:
        context: AuthContext = info.context
        if not context.user_id:
            raise Exception("Not authenticated")

        service = await get_wallet_service(info)
        try:
            favs = await service.get_favorites(context.user_id)
            return [FavoriteType(id=str(f.id), name=f.name, account_identifier=f.account_identifier) for f in favs]
        finally:
            await service.session.close()

    @strawberry.field
    async def resolve_recipient(self, info: Info, mobile: str) -> RecipientType | None:
        context: AuthContext = info.context
        if not context.user_id:
            raise Exception("Not authenticated")

        session = async_session_factory()
        repo = UserRepository(session)
        try:
            user = await repo.get_by_phone(mobile)
            if not user:
                return None
            return RecipientType.from_user(user)
        finally:
            await session.close()


@strawberry.type
class WalletMutations:
    @strawberry.mutation
    async def set_pin(self, info: Info, pin: str) -> bool:
        context: AuthContext = info.context
        if not context.user_id:
            raise Exception("Not authenticated")

        service = await get_wallet_service(info)
        try:
            await service.set_pin(context.user_id, pin)
            return True
        except ValidationError as e:
            raise Exception(str(e))
        finally:
            await service.session.close()

    @strawberry.mutation
    async def verify_pin(self, info: Info, pin: str) -> bool:
        context: AuthContext = info.context
        if not context.user_id:
            raise Exception("Not authenticated")

        service = await get_wallet_service(info)
        try:
            return await service.verify_pin(context.user_id, pin)
        except ValidationError as e:
            raise Exception(str(e))
        finally:
            await service.session.close()

    @strawberry.mutation
    async def add_favorite(self, info: Info, name: str, account_identifier: str) -> FavoriteType:
        context: AuthContext = info.context
        if not context.user_id:
            raise Exception("Not authenticated")

        service = await get_wallet_service(info)
        try:
            fav = await service.add_favorite(context.user_id, name, account_identifier)
            return FavoriteType(id=str(fav.id), name=fav.name, account_identifier=fav.account_identifier)
        finally:
            await service.session.close()

    @strawberry.mutation
    async def remove_favorite(self, info: Info, id: str) -> bool:
        context: AuthContext = info.context
        if not context.user_id:
            raise Exception("Not authenticated")

        service = await get_wallet_service(info)
        try:
            return await service.remove_favorite(uuid.UUID(id), context.user_id)
        finally:
            await service.session.close()