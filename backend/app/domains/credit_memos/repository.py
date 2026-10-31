import uuid
from collections.abc import Collection

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.domains.auth.models import User
from app.domains.credit_memos.models import CreditMemo, CreditMemoStatus
from app.domains.transactions.models import (
    Transaction,
    TransactionStatus,
    TransactionType,
)

_OPEN_STATUSES = (CreditMemoStatus.FOR_REVIEW, CreditMemoStatus.APPROVED)


class CreditMemoRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, memo: CreditMemo) -> CreditMemo:
        self.session.add(memo)
        await self.session.flush()
        return memo

    async def get_by_id(
        self, memo_id: uuid.UUID, *, for_update: bool = False
    ) -> CreditMemo | None:
        query = select(CreditMemo).where(
            CreditMemo.id == memo_id, CreditMemo.deleted_at.is_(None)
        )
        if for_update:
            query = query.with_for_update()
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def get_by_idempotency_key(self, key: str) -> CreditMemo | None:
        result = await self.session.execute(
            select(CreditMemo).where(
                CreditMemo.idempotency_key == key,
                CreditMemo.deleted_at.is_(None),
            )
        )
        return result.scalar_one_or_none()

    async def sum_open_amounts(
        self, transaction_id: uuid.UUID, *, exclude_memo_id: uuid.UUID | None = None
    ) -> int:
        query = select(func.coalesce(func.sum(CreditMemo.amount_cents), 0)).where(
            CreditMemo.transaction_id == transaction_id,
            CreditMemo.deleted_at.is_(None),
            CreditMemo.status.in_(_OPEN_STATUSES),
        )
        if exclude_memo_id is not None:
            query = query.where(CreditMemo.id != exclude_memo_id)
        result = await self.session.execute(query)
        return int(result.scalar() or 0)

    async def list_memos(
        self,
        *,
        merchant_user_id: uuid.UUID | None = None,
        status: CreditMemoStatus | None = None,
        search: str | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[list[CreditMemo], int]:
        query = select(CreditMemo).where(CreditMemo.deleted_at.is_(None))

        if merchant_user_id is not None:
            query = query.where(CreditMemo.merchant_user_id == merchant_user_id)
        if status is not None:
            query = query.where(CreditMemo.status == status)

        if search and search.strip():
            pattern = f"%{search.strip()}%"
            customer = aliased(User)
            merchant = aliased(User)
            query = (
                query.join(Transaction, Transaction.id == CreditMemo.transaction_id)
                .join(customer, customer.id == CreditMemo.customer_user_id)
                .join(merchant, merchant.id == CreditMemo.merchant_user_id)
                .where(
                    or_(
                        CreditMemo.reference.ilike(pattern),
                        Transaction.reference.ilike(pattern),
                        customer.email.ilike(pattern),
                        customer.first_name.ilike(pattern),
                        customer.last_name.ilike(pattern),
                        merchant.email.ilike(pattern),
                        merchant.first_name.ilike(pattern),
                        merchant.last_name.ilike(pattern),
                    )
                )
            )

        count_query = query.with_only_columns(func.count(CreditMemo.id))
        total = (await self.session.execute(count_query)).scalar() or 0

        result = await self.session.execute(
            query.order_by(CreditMemo.created_at.desc()).offset(offset).limit(limit)
        )
        return list(result.scalars().all()), int(total)

    async def search_taggable_transactions(
        self,
        merchant_wallet_id: uuid.UUID,
        reference: str,
        *,
        limit: int = 10,
    ) -> list[tuple[Transaction, int]]:
        credited = (
            select(
                CreditMemo.transaction_id.label("transaction_id"),
                func.coalesce(func.sum(CreditMemo.amount_cents), 0).label(
                    "credited_cents"
                ),
            )
            .where(
                CreditMemo.deleted_at.is_(None),
                CreditMemo.status.in_(_OPEN_STATUSES),
            )
            .group_by(CreditMemo.transaction_id)
            .subquery()
        )

        pattern = f"%{reference.strip()}%"
        query = (
            select(Transaction, func.coalesce(credited.c.credited_cents, 0))
            .outerjoin(credited, credited.c.transaction_id == Transaction.id)
            .where(
                Transaction.receiver_wallet_id == merchant_wallet_id,
                Transaction.status == TransactionStatus.SUCCESS,
                Transaction.type.in_(
                    (TransactionType.SEND, TransactionType.QR_PAYMENT)
                ),
                Transaction.reference.ilike(pattern),
            )
            .order_by(Transaction.created_at.desc())
            .limit(limit)
        )
        rows = (await self.session.execute(query)).all()
        return [(row[0], int(row[1])) for row in rows]

    async def get_users_by_ids(
        self, user_ids: Collection[uuid.UUID]
    ) -> dict[uuid.UUID, User]:
        if not user_ids:
            return {}
        result = await self.session.execute(select(User).where(User.id.in_(user_ids)))
        return {user.id: user for user in result.scalars().all()}

    async def get_transactions_by_ids(
        self, transaction_ids: Collection[uuid.UUID]
    ) -> dict[uuid.UUID, Transaction]:
        if not transaction_ids:
            return {}
        result = await self.session.execute(
            select(Transaction).where(Transaction.id.in_(transaction_ids))
        )
        return {tx.id: tx for tx in result.scalars().all()}
