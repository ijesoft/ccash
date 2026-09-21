"""Transaction history export: binary downloads (REST, not GraphQL — same
rationale as app/api/branding.py) plus "email me my history" as a PDF
attachment.

Two routers:
- ``router`` (mounted at /reports): a Member or Merchant exporting their own
  account, for saving to their phone or emailing to their registered address.
- ``admin_router`` (mounted at /admin/reports): platform-wide ("for
  tracking") and per-account ("for reconciliation") exports for Admin.
"""

import base64
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from app.core.errors import NotFoundError
from app.core.rest_auth import require_admin_token, require_user_token
from app.database import async_session_factory
from app.domains.admin.reports import generate_all_transactions_excel, generate_all_transactions_pdf
from app.domains.admin.service import AdminService
from app.domains.auth.repository import UserRepository
from app.domains.transactions.reports import generate_transaction_history_excel, generate_transaction_history_pdf
from app.domains.transactions.service import TransactionService
from app.tasks.notifications import send_email_notification

PDF_MEDIA_TYPE = "application/pdf"
XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

router = APIRouter()
admin_router = APIRouter()


def _timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def _download(content: bytes, media_type: str, filename: str) -> Response:
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


async def _account_report(session, user_id: uuid.UUID) -> tuple[str, list[tuple[str, str]], list]:
    admin_service = AdminService(session)
    label, meta = await admin_service.get_account_report_context(user_id)
    tx_service = TransactionService(session)
    views = await tx_service.list_for_report(user_id)
    return label, meta, views


# --------------------------------------------------------------------- self


@router.get("/transactions.pdf")
async def download_own_transactions_pdf(user_id: uuid.UUID = Depends(require_user_token)):
    session = async_session_factory()
    try:
        label, meta, views = await _account_report(session, user_id)
        pdf_bytes = generate_transaction_history_pdf(label, meta, views)
        return _download(pdf_bytes, PDF_MEDIA_TYPE, f"ccash-transactions-{_timestamp()}.pdf")
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    finally:
        await session.close()


@router.get("/transactions.xlsx")
async def download_own_transactions_excel(user_id: uuid.UUID = Depends(require_user_token)):
    session = async_session_factory()
    try:
        label, meta, views = await _account_report(session, user_id)
        xlsx_bytes = generate_transaction_history_excel(label, meta, views)
        return _download(xlsx_bytes, XLSX_MEDIA_TYPE, f"ccash-transactions-{_timestamp()}.xlsx")
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    finally:
        await session.close()


@router.post("/transactions/email")
async def email_own_transactions(user_id: uuid.UUID = Depends(require_user_token)):
    session = async_session_factory()
    try:
        user = await UserRepository(session).get_by_id(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="Account not found")

        label, meta, views = await _account_report(session, user_id)
        pdf_bytes = generate_transaction_history_pdf(label, meta, views)

        send_email_notification.delay(
            to_email=user.email,
            subject="Your Campe Wallet Transaction History",
            body=(
                "Attached is your Campe Wallet transaction history as of "
                f"{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}."
            ),
            attachment_base64=base64.b64encode(pdf_bytes).decode("ascii"),
            attachment_filename=f"ccash-transactions-{_timestamp()}.pdf",
            attachment_content_type=PDF_MEDIA_TYPE,
        )
        return {"status": "queued", "email": user.email}
    finally:
        await session.close()


# -------------------------------------------------------------------- admin


@admin_router.get("/transactions/all.pdf")
async def download_all_transactions_pdf(_actor: uuid.UUID = Depends(require_admin_token)):
    session = async_session_factory()
    try:
        rows = await AdminService(session).list_all_transactions_for_report()
        pdf_bytes = generate_all_transactions_pdf(rows)
        return _download(pdf_bytes, PDF_MEDIA_TYPE, f"ccash-all-transactions-{_timestamp()}.pdf")
    finally:
        await session.close()


@admin_router.get("/transactions/all.xlsx")
async def download_all_transactions_excel(_actor: uuid.UUID = Depends(require_admin_token)):
    session = async_session_factory()
    try:
        rows = await AdminService(session).list_all_transactions_for_report()
        xlsx_bytes = generate_all_transactions_excel(rows)
        return _download(xlsx_bytes, XLSX_MEDIA_TYPE, f"ccash-all-transactions-{_timestamp()}.xlsx")
    finally:
        await session.close()


@admin_router.get("/transactions/{account_id}.pdf")
async def download_account_transactions_pdf(account_id: str, _actor: uuid.UUID = Depends(require_admin_token)):
    session = async_session_factory()
    try:
        label, meta, views = await _account_report(session, uuid.UUID(account_id))
        pdf_bytes = generate_transaction_history_pdf(label, meta, views)
        return _download(pdf_bytes, PDF_MEDIA_TYPE, f"ccash-transactions-{account_id}-{_timestamp()}.pdf")
    except (NotFoundError, ValueError) as e:
        raise HTTPException(status_code=404, detail=str(e))
    finally:
        await session.close()


@admin_router.get("/transactions/{account_id}.xlsx")
async def download_account_transactions_excel(account_id: str, _actor: uuid.UUID = Depends(require_admin_token)):
    session = async_session_factory()
    try:
        label, meta, views = await _account_report(session, uuid.UUID(account_id))
        xlsx_bytes = generate_transaction_history_excel(label, meta, views)
        return _download(xlsx_bytes, XLSX_MEDIA_TYPE, f"ccash-transactions-{account_id}-{_timestamp()}.xlsx")
    except (NotFoundError, ValueError) as e:
        raise HTTPException(status_code=404, detail=str(e))
    finally:
        await session.close()
