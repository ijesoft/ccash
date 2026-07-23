import uuid

import strawberry
from strawberry.types import Info

from app.database import async_session_factory
from app.domains.admin.service import AdminService
from app.domains.auth.graphql import UserType


@strawberry.type
class PlatformStats:
    total_users: int
    active_wallets: int
    total_transactions: int
    transaction_volume_cents: int


async def get_admin_service(info: Info) -> AdminService:
    session = async_session_factory()
    return AdminService(session)


def require_admin(context):
    if not context.user_id or "admin" not in context.scopes:
        raise Exception("Not authorized")


@strawberry.type
class AdminQueries:
    @strawberry.field
    async def platform_stats(self, info: Info) -> PlatformStats:
        require_admin(info.context)
        service = await get_admin_service(info)
        try:
            stats = await service.get_platform_stats()
            return PlatformStats(**stats)
        finally:
            await service.session.close()

    @strawberry.field
    async def admin_users(self, info: Info, limit: int = 20, offset: int = 0) -> list[UserType]:
        require_admin(info.context)
        service = await get_admin_service(info)
        try:
            users, _ = await service.list_users(limit, offset)
            return [UserType.from_model(u) for u in users]
        finally:
            await service.session.close()


@strawberry.type
class AdminMutations:
    @strawberry.mutation
    async def suspend_user(self, info: Info, user_id: str) -> UserType | None:
        require_admin(info.context)
        service = await get_admin_service(info)
        try:
            user = await service.suspend_user(uuid.UUID(user_id))
            return UserType.from_model(user) if user else None
        finally:
            await service.session.close()

    @strawberry.mutation
    async def activate_user(self, info: Info, user_id: str) -> UserType | None:
        require_admin(info.context)
        service = await get_admin_service(info)
        try:
            user = await service.activate_user(uuid.UUID(user_id))
            return UserType.from_model(user) if user else None
        finally:
            await service.session.close()