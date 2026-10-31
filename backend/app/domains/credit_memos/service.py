"""Credit memo workflow: merchant submission and admin review."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import AuditLog
from app.core.errors import (
    AuthorizationError,
    InsufficientFundsError,
    NotFoundError,
    ValidationError,
    WalletNotActiveError,
)
from app.core.money import format_php
from app.domains.auth.models import User, UserRole
from app.domains.auth.repository import UserRepository
from app.domains.credit_memos.models import CreditMemo, CreditMemoStatus
from app.domains.credit_memos.policy import (
    generate_credit_memo_reference,
    validate_credit_memo_amount,
    validate_reason,
)
from app.domains.credit_memos.repository import CreditMemoRepository
from app.domains.notifications.models import NotificationType
from app.domains.notifications.repository import NotificationRepository
from app.domains.transactions.models import (
    Transaction,
    TransactionStatus,
    TransactionType,
)
from app.domains.transactions.policy import generate_reference
from app.domains.transactions.repository import TransactionRepository
from app.domains.wallets.models import WalletStatus
from app.domains.wallets.repository import WalletRepository
from app.websocket.manager import manager


@dataclass(frozen=True)
class CreditMemoView:
    memo: CreditMemo
    merchant: User
    customer: User
    transaction: Transaction
    refund_transaction: Transaction | None
    decided_by: User | None


@dataclass(frozen=True)
class TaggableTransactionView:
    transaction: Transaction
    customer: User | None
    credited_cents: int
    remaining_cents: int


def _display_name(user: User) -> str:
    return f"{user.first_name or ''} {user.last_name or ''}".strip() or user.email


class CreditMemoService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.memos = CreditMemoRepository(session)
        self.wallets = WalletRepository(session)
        self.transactions = TransactionRepository(session)
        self.users = UserRepository(session)
        self.notifications = NotificationRepository(session)
        self._pending_pushes: list[tuple[str, dict]] = []

    async def submit(
        self,
        merchant_user_id: uuid.UUID,
        transaction_id: uuid.UUID,
        amount_cents: int,
        reason: str,
        idempotency_key: str,
    ) -> CreditMemoView:
        merchant = await self.users.get_by_id(merchant_user_id)
        if merchant is None or merchant.role != UserRole.MERCHANT:
            raise AuthorizationError("Only merchants can submit credit memos")

        existing = await self.memos.get_by_idempotency_key(idempotency_key)
        if existing is not None:
            if existing.merchant_user_id != merchant_user_id:
                raise ValidationError("Idempotency key already used")
            return await self._view(existing)

        wallet = await self.wallets.get_by_user_id(merchant_user_id)
        if wallet is None:
            raise NotFoundError("Merchant wallet not found")

        tx = await self.transactions.get_by_id(transaction_id, for_update=True)
        if tx is None:
            raise NotFoundError("Transaction not found")
        if tx.receiver_wallet_id != wallet.id:
            raise AuthorizationError("Transaction was not received by this merchant")
        if tx.status != TransactionStatus.SUCCESS:
            raise ValidationError("Only successful transactions can be disputed")
        if tx.type not in (TransactionType.SEND, TransactionType.QR_PAYMENT):
            raise ValidationError("Only customer payments can be disputed")
        if tx.sender_wallet_id is None:
            raise ValidationError("Transaction has no customer wallet")

        customer_wallet = await self.wallets.get_by_id(tx.sender_wallet_id)
        customer = (
            await self.users.get_by_id(customer_wallet.user_id)
            if customer_wallet is not None
            else None
        )
        if customer_wallet is None or customer is None:
            raise NotFoundError("Customer account not found")

        credited = await self.memos.sum_open_amounts(tx.id)
        validate_credit_memo_amount(amount_cents, tx.amount_cents, credited)
        cleaned_reason = validate_reason(reason)

        memo = CreditMemo(
            reference=generate_credit_memo_reference(),
            idempotency_key=idempotency_key,
            merchant_user_id=merchant.id,
            merchant_wallet_id=wallet.id,
            customer_user_id=customer.id,
            customer_wallet_id=customer_wallet.id,
            transaction_id=tx.id,
            amount_cents=amount_cents,
            reason=cleaned_reason,
            status=CreditMemoStatus.FOR_REVIEW,
        )
        await self.memos.create(memo)
        self.session.add(
            AuditLog(
                user_id=merchant.id,
                action="credit_memo.submit",
                resource_type="credit_memo",
                resource_id=str(memo.id),
                new_values={
                    "reference": memo.reference,
                    "transaction_id": str(tx.id),
                    "amount_cents": amount_cents,
                },
            )
        )
        try:
            await self._commit()
        except IntegrityError:
            winner = await self.memos.get_by_idempotency_key(idempotency_key)
            if winner is None:
                raise
            return await self._view(winner)
        return await self._view(memo)

    async def cancel(
        self, merchant_user_id: uuid.UUID, memo_id: uuid.UUID
    ) -> CreditMemoView:
        memo = await self.memos.get_by_id(memo_id, for_update=True)
        if memo is None or memo.merchant_user_id != merchant_user_id:
            raise NotFoundError("Credit memo not found")
        if memo.status != CreditMemoStatus.FOR_REVIEW:
            raise ValidationError("Only memos under review can be cancelled")

        memo.status = CreditMemoStatus.CANCELLED
        memo.cancelled_at = datetime.now(timezone.utc)
        self.session.add(memo)
        self.session.add(
            AuditLog(
                user_id=merchant_user_id,
                action="credit_memo.cancel",
                resource_type="credit_memo",
                resource_id=str(memo.id),
                old_values={"status": CreditMemoStatus.FOR_REVIEW.value},
                new_values={"status": CreditMemoStatus.CANCELLED.value},
            )
        )
        await self._commit()
        return await self._view(memo)

    async def approve(
        self,
        admin_user_id: uuid.UUID,
        memo_id: uuid.UUID,
        note: str | None,
        idempotency_key: str,
    ) -> CreditMemoView:
        admin = await self.users.get_by_id(admin_user_id)
        if admin is None or admin.role not in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
            raise AuthorizationError("Only admins can approve credit memos")

        memo = await self.memos.get_by_id(memo_id, for_update=True)
        if memo is None:
            raise NotFoundError("Credit memo not found")
        if memo.status == CreditMemoStatus.APPROVED:
            return await self._view(memo)
        if memo.status != CreditMemoStatus.FOR_REVIEW:
            raise ValidationError("Only memos under review can be approved")

        cleaned_note = (note or "").strip() or None
        if cleaned_note and len(cleaned_note) > 1000:
            raise ValidationError("Admin note must be at most 1000 characters")

        original = await self.transactions.get_by_id(memo.transaction_id)
        if original is None or original.status != TransactionStatus.SUCCESS:
            raise ValidationError("The original transaction is no longer eligible")
        if (
            original.receiver_wallet_id != memo.merchant_wallet_id
            or original.sender_wallet_id != memo.customer_wallet_id
        ):
            raise ValidationError("The original transaction no longer matches this memo")
        if await self.transactions.get_by_idempotency_key(idempotency_key):
            raise ValidationError("Idempotency key already used")

        locked: dict[uuid.UUID, object] = {}
        for wallet_id in sorted(
            (memo.merchant_wallet_id, memo.customer_wallet_id), key=str
        ):
            locked[wallet_id] = await self.wallets.get_for_update(wallet_id)
        merchant_wallet = locked.get(memo.merchant_wallet_id)
        customer_wallet = locked.get(memo.customer_wallet_id)
        if merchant_wallet is None or customer_wallet is None:
            raise NotFoundError("Wallet not found")
        if (
            merchant_wallet.status != WalletStatus.ACTIVE
            or customer_wallet.status != WalletStatus.ACTIVE
        ):
            raise WalletNotActiveError("Both wallets must be active to approve a refund")
        if merchant_wallet.balance_cents < memo.amount_cents:
            raise InsufficientFundsError("Merchant has insufficient funds for this refund")

        refund = Transaction(
            idempotency_key=idempotency_key,
            reference=generate_reference(),
            type=TransactionType.CREDIT_MEMO,
            status=TransactionStatus.SUCCESS,
            sender_wallet_id=merchant_wallet.id,
            receiver_wallet_id=customer_wallet.id,
            amount_cents=memo.amount_cents,
            fee_cents=0,
            net_amount_cents=memo.amount_cents,
            description=f"Credit memo {memo.reference}",
            tx_metadata={
                "credit_memo_id": str(memo.id),
                "original_transaction_id": str(original.id),
            },
            created_by=admin_user_id,
        )
        await self.transactions.create(refund)
        await self.wallets.update_balance(merchant_wallet.id, -memo.amount_cents)
        await self.wallets.update_balance(customer_wallet.id, memo.amount_cents)

        merchant_user = await self.users.get_by_id(memo.merchant_user_id)
        customer_user = await self.users.get_by_id(memo.customer_user_id)
        if merchant_user is None or customer_user is None:
            raise NotFoundError("Credit memo party not found")

        await self._queue_notification(
            merchant_wallet.user_id,
            "Credit memo approved",
            f"Credit memo {memo.reference} for {format_php(memo.amount_cents)} "
            f"was approved and refunded to {_display_name(customer_user)}.",
            memo,
            refund,
        )
        await self._queue_notification(
            customer_wallet.user_id,
            "Credit memo refund received",
            f"You received {format_php(memo.amount_cents)} as a credit memo "
            f"refund from {_display_name(merchant_user)}.",
            memo,
            refund,
        )

        memo.status = CreditMemoStatus.APPROVED
        memo.admin_note = cleaned_note
        memo.decided_by = admin_user_id
        memo.decided_at = datetime.now(timezone.utc)
        memo.refund_transaction_id = refund.id
        self.session.add(memo)
        self.session.add(
            AuditLog(
                user_id=admin_user_id,
                action="credit_memo.approve",
                resource_type="credit_memo",
                resource_id=str(memo.id),
                old_values={"status": CreditMemoStatus.FOR_REVIEW.value},
                new_values={
                    "status": CreditMemoStatus.APPROVED.value,
                    "amount_cents": memo.amount_cents,
                    "refund_transaction_id": str(refund.id),
                },
            )
        )
        await self._commit()
        return await self._view(memo)

    async def decline(
        self, admin_user_id: uuid.UUID, memo_id: uuid.UUID, note: str
    ) -> CreditMemoView:
        admin = await self.users.get_by_id(admin_user_id)
        if admin is None or admin.role not in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
            raise AuthorizationError("Only admins can decline credit memos")

        memo = await self.memos.get_by_id(memo_id, for_update=True)
        if memo is None:
            raise NotFoundError("Credit memo not found")
        if memo.status == CreditMemoStatus.DECLINED:
            return await self._view(memo)
        if memo.status != CreditMemoStatus.FOR_REVIEW:
            raise ValidationError("Only memos under review can be declined")

        cleaned_note = validate_reason(note, field="Decline reason")

        memo.status = CreditMemoStatus.DECLINED
        memo.admin_note = cleaned_note
        memo.decided_by = admin_user_id
        memo.decided_at = datetime.now(timezone.utc)
        self.session.add(memo)
        await self._queue_notification(
            memo.merchant_user_id,
            "Credit memo declined",
            f"Credit memo {memo.reference} was declined. Reason: {cleaned_note}",
            memo,
        )
        self.session.add(
            AuditLog(
                user_id=admin_user_id,
                action="credit_memo.decline",
                resource_type="credit_memo",
                resource_id=str(memo.id),
                old_values={"status": CreditMemoStatus.FOR_REVIEW.value},
                new_values={
                    "status": CreditMemoStatus.DECLINED.value,
                    "admin_note": cleaned_note,
                },
            )
        )
        await self._commit()
        return await self._view(memo)

    async def search_taggable(
        self,
        merchant_user_id: uuid.UUID,
        reference: str,
        *,
        limit: int = 10,
    ) -> list[TaggableTransactionView]:
        merchant = await self.users.get_by_id(merchant_user_id)
        if merchant is None or merchant.role != UserRole.MERCHANT:
            raise AuthorizationError("Only merchants can search credited transactions")

        cleaned = (reference or "").strip()
        if len(cleaned) < 2:
            return []

        wallet = await self.wallets.get_by_user_id(merchant_user_id)
        if wallet is None:
            return []

        rows = await self.memos.search_taggable_transactions(
            wallet.id, cleaned, limit=max(1, min(limit, 25))
        )
        owners = await self.wallets.get_owners_by_wallet_ids(
            {
                tx.sender_wallet_id
                for tx, _credited in rows
                if tx.sender_wallet_id is not None
            }
        )
        views: list[TaggableTransactionView] = []
        for tx, credited in rows:
            customer = owners.get(tx.sender_wallet_id) if tx.sender_wallet_id else None
            views.append(
                TaggableTransactionView(
                    transaction=tx,
                    customer=customer,
                    credited_cents=credited,
                    remaining_cents=max(tx.amount_cents - credited, 0),
                )
            )
        return views

    async def list(
        self,
        user_id: uuid.UUID,
        role: str,
        *,
        status: str | None = None,
        search: str | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[list[CreditMemoView], int]:
        merchant_user_id: uuid.UUID | None
        if role == UserRole.MERCHANT.value:
            merchant_user_id = user_id
        elif role in (UserRole.ADMIN.value, UserRole.SUPER_ADMIN.value):
            merchant_user_id = None
        else:
            raise AuthorizationError("Not authorized")

        status_enum: CreditMemoStatus | None = None
        if status:
            try:
                status_enum = CreditMemoStatus(status)
            except ValueError:
                raise ValidationError("Invalid credit memo status") from None

        limit = max(1, min(limit, 100))
        offset = max(offset, 0)
        memos, total = await self.memos.list_memos(
            merchant_user_id=merchant_user_id,
            status=status_enum,
            search=search,
            limit=limit,
            offset=offset,
        )
        return await self._build_views(memos), total

    async def get(
        self, user_id: uuid.UUID, role: str, memo_id: uuid.UUID
    ) -> CreditMemoView | None:
        memo = await self.memos.get_by_id(memo_id)
        if memo is None:
            return None
        if role == UserRole.MERCHANT.value and memo.merchant_user_id != user_id:
            return None
        if role not in (
            UserRole.MERCHANT.value,
            UserRole.ADMIN.value,
            UserRole.SUPER_ADMIN.value,
        ):
            raise AuthorizationError("Not authorized")
        views = await self._build_views([memo])
        return views[0] if views else None

    async def _build_views(self, memos: list[CreditMemo]) -> list[CreditMemoView]:
        user_ids: set[uuid.UUID] = set()
        transaction_ids: set[uuid.UUID] = set()
        for memo in memos:
            user_ids.update((memo.merchant_user_id, memo.customer_user_id))
            if memo.decided_by is not None:
                user_ids.add(memo.decided_by)
            transaction_ids.add(memo.transaction_id)
            if memo.refund_transaction_id is not None:
                transaction_ids.add(memo.refund_transaction_id)

        users = await self.memos.get_users_by_ids(user_ids)
        transactions = await self.memos.get_transactions_by_ids(transaction_ids)

        views: list[CreditMemoView] = []
        for memo in memos:
            merchant = users.get(memo.merchant_user_id)
            customer = users.get(memo.customer_user_id)
            original = transactions.get(memo.transaction_id)
            if merchant is None or customer is None or original is None:
                continue
            views.append(
                CreditMemoView(
                    memo=memo,
                    merchant=merchant,
                    customer=customer,
                    transaction=original,
                    refund_transaction=transactions.get(memo.refund_transaction_id)
                    if memo.refund_transaction_id
                    else None,
                    decided_by=users.get(memo.decided_by)
                    if memo.decided_by
                    else None,
                )
            )
        return views

    async def _view(self, memo: CreditMemo) -> CreditMemoView:
        views = await self._build_views([memo])
        if not views:
            raise NotFoundError("Credit memo not found")
        return views[0]

    async def _queue_notification(
        self,
        user_id: uuid.UUID,
        title: str,
        body: str,
        memo: CreditMemo,
        refund: Transaction | None = None,
    ) -> None:
        data: dict = {
            "credit_memo_id": str(memo.id),
            "reference": memo.reference,
            "amount_cents": memo.amount_cents,
        }
        if refund is not None:
            data["transaction_id"] = str(refund.id)
            data["transaction_reference"] = refund.reference
        notification = await self.notifications.create(
            user_id, NotificationType.CREDIT_MEMO, title, body, data
        )
        self._pending_pushes.append(
            (
                str(user_id),
                {
                    "type": "notification",
                    "data": {
                        "id": str(notification.id),
                        "type": notification.type.value,
                        "title": notification.title,
                        "body": notification.body,
                        "is_read": notification.is_read,
                        "created_at": notification.created_at.isoformat()
                        if notification.created_at
                        else "",
                    },
                },
            )
        )

    async def _commit(self) -> None:
        try:
            await self.session.commit()
        except IntegrityError:
            await self.session.rollback()
            self._pending_pushes.clear()
            raise
        pushes, self._pending_pushes = self._pending_pushes, []
        for user_id, message in pushes:
            await manager.send_to_user(user_id, message)
