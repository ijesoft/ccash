from celery import Celery

from app.config import settings

celery_app = Celery(
    "ccash",
    broker=settings.rabbitmq_url,
    backend=settings.redis_url,
    include=["app.tasks.notifications"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Manila",
    enable_utc=True,
    beat_schedule={
        "reset-daily-limits": {
            "task": "app.tasks.notifications.reset_daily_limits",
            "schedule": 86400.0,
        },
    },
)