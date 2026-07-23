import uuid

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.notifications.models import Notification, NotificationType


class NotificationRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, user_id: uuid.UUID, notif_type: NotificationType, title: str, body: str, data: dict | None = None) -> Notification:
        notif = Notification(user_id=user_id, type=notif_type, title=title, body=body, data=data)
        self.session.add(notif)
        await self.session.flush()
        return notif

    async def list_by_user(self, user_id: uuid.UUID, limit: int = 20, offset: int = 0) -> tuple[list[Notification], int]:
        query = select(Notification).where(Notification.user_id == user_id)

        count_query = query.with_only_columns(func.count())
        total_result = await self.session.execute(count_query)
        total = total_result.scalar() or 0

        query = query.order_by(Notification.created_at.desc()).offset(offset).limit(limit)
        result = await self.session.execute(query)

        return list(result.scalars().all()), total

    async def mark_read(self, notif_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        result = await self.session.execute(
            update(Notification)
            .where(Notification.id == notif_id, Notification.user_id == user_id)
            .values(is_read=True)
        )
        return result.rowcount > 0

    async def mark_all_read(self, user_id: uuid.UUID) -> int:
        result = await self.session.execute(
            update(Notification).where(Notification.user_id == user_id, Notification.is_read == False).values(is_read=True)
        )
        return result.rowcount

    async def count_unread(self, user_id: uuid.UUID) -> int:
        result = await self.session.execute(
            select(func.count()).where(Notification.user_id == user_id, Notification.is_read == False)
        )
        return result.scalar() or 0