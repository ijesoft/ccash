import asyncio

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory
from app.domains.wallets.models import Wallet
from app.tasks.celery_app import celery_app


@celery_app.task
def send_email_notification(
    to_email: str,
    subject: str,
    body: str,
    attachment_base64: str | None = None,
    attachment_filename: str | None = None,
    attachment_content_type: str = "application/octet-stream",
):
    """Send an email, optionally with one attachment.

    Celery task args must be JSON-serializable, so a binary attachment (a
    generated PDF/Excel report) is passed as a base64 string rather than raw
    bytes; both the Resend and Mailpit/smtplib paths decode it as needed.
    """
    from app.config import settings

    has_attachment = attachment_base64 is not None and attachment_filename is not None

    if settings.resend_api_key:
        import resend

        resend.api_key = settings.resend_api_key
        try:
            payload = {
                "from": settings.mail_from,
                "to": [to_email],
                "subject": subject,
                "text": body,
            }
            if has_attachment:
                # Resend's HTTP API accepts attachment content as a base64 string.
                payload["attachments"] = [
                    {"filename": attachment_filename, "content": attachment_base64}
                ]
            resend.Emails.send(payload)
            return
        except Exception as e:
            print(f"[send_email] Resend failed, falling back to Mailpit: {e}")

    import base64
    import smtplib
    from email.mime.application import MIMEApplication
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText

    if has_attachment:
        msg = MIMEMultipart()
        msg.attach(MIMEText(body))
        part = MIMEApplication(base64.b64decode(attachment_base64), _subtype=attachment_content_type.split("/")[-1])
        part.add_header("Content-Disposition", "attachment", filename=attachment_filename)
        msg.attach(part)
    else:
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