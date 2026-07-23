import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.notifications.models import Notification, NotificationType
from app.domains.notifications.repository import NotificationRepository
from app.websocket.manager import manager


class NotificationService:
    def __init__(self, session: AsyncSession):
        self.repo = NotificationRepository(session)
        self.session = session

    async def send_notification(
        self, user_id: uuid.UUID, notif_type: NotificationType, title: str, body: str, data: dict | None = None
    ) -> Notification:
        notif = await self.repo.create(user_id, notif_type, title, body, data)

        await manager.send_to_user(
            str(user_id),
            {
                "type": "notification",
                "data": {
                    "id": str(notif.id),
                    "type": notif.type.value,
                    "title": notif.title,
                    "body": notif.body,
                    "is_read": notif.is_read,
                    "created_at": notif.created_at.isoformat() if notif.created_at else "",
                },
            },
        )

        return notif

    async def list_notifications(self, user_id: uuid.UUID, limit: int = 20, offset: int = 0) -> tuple[list[Notification], int]:
        return await self.repo.list_by_user(user_id, limit, offset)

    async def mark_read(self, notif_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        return await self.repo.mark_read(notif_id, user_id)

    async def mark_all_read(self, user_id: uuid.UUID) -> int:
        return await self.repo.mark_all_read(user_id)

    async def count_unread(self, user_id: uuid.UUID) -> int:
        return await self.repo.count_unread(user_id)