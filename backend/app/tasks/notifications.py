import asyncio

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory
from app.domains.wallets.models import Wallet
from app.tasks.celery_app import celery_app


@celery_app.task
def send_email_notification(to_email: str, subject: str, body: str):
    from app.config import settings

    if settings.resend_api_key:
        import resend

        resend.api_key = settings.resend_api_key
        try:
            resend.Emails.send({
                "from": settings.mail_from,
                "to": [to_email],
                "subject": subject,
                "text": body,
            })
            return
        except Exception as e:
            print(f"[send_email] Resend failed, falling back to Mailpit: {e}")

    import smtplib
    from email.mime.text import MIMEText

    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = settings.mail_from
    msg["To"] = to_email

    try:
        with smtplib.SMTP(settings.mailpit_smtp_host, settings.mailpit_smtp_port) as server:
            server.sendmail(settings.mail_from, [to_email], msg.as_string())
    except Exception:
        pass


@celery_app.task
def reset_daily_limits():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(_reset_limits())
    loop.close()


async def _reset_limits():
    async with async_session_factory() as session:
        await session.execute(update(Wallet).values(daily_send_used_cents=0))
        await session.commit()