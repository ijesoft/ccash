import uuid

import strawberry
from strawberry.types import Info

from app.database import async_session_factory
from app.domains.notifications.service import NotificationService
from app.graphql.middleware import AuthContext
from app.graphql.scalars import PaginationInfo


@strawberry.type
class NotificationType:
    id: str
    type: str
    title: str
    body: str
    is_read: bool
    created_at: str


@strawberry.type
class NotificationConnection:
    items: list[NotificationType]
    pagination: PaginationInfo


async def get_notif_service(info: Info) -> NotificationService:
    session = async_session_factory()
    return NotificationService(session)


@strawberry.type
class NotificationQueries:
    @strawberry.field
    async def notifications(self, info: Info, limit: int = 20, offset: int = 0) -> NotificationConnection:
        context: AuthContext = info.context
        if not context.user_id:
            raise Exception("Not authenticated")

        service = await get_notif_service(info)
        try:
            items, total = await service.list_notifications(context.user_id, limit, offset)
            return NotificationConnection(
                items=[NotificationType(id=str(n.id), type=n.type.value, title=n.title, body=n.body, is_read=n.is_read, created_at=n.created_at.isoformat() if n.created_at else "") for n in items],
                pagination=PaginationInfo(has_next=(offset + limit) < total, has_previous=offset > 0, total=total),
            )
        finally:
            await service.session.close()

    @strawberry.field
    async def unread_count(self, info: Info) -> int:
        context: AuthContext = info.context
        if not context.user_id:
            return 0

        service = await get_notif_service(info)
        try:
            return await service.count_unread(context.user_id)
        finally:
            await service.session.close()


@strawberry.type
class NotificationMutations:
    @strawberry.mutation
    async def mark_notification_read(self, info: Info, id: str) -> bool:
        context: AuthContext = info.context
        if not context.user_id:
            raise Exception("Not authenticated")

        service = await get_notif_service(info)
        try:
            return await service.mark_read(uuid.UUID(id), context.user_id)
        finally:
            await service.session.close()

    @strawberry.mutation
    async def mark_all_notifications_read(self, info: Info) -> int:
        context: AuthContext = info.context
        if not context.user_id:
            raise Exception("Not authenticated")

        service = await get_notif_service(info)
        try:
            return await service.mark_all_read(context.user_id)
        finally:
            await service.session.close()