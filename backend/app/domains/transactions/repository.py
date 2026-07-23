import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.transactions.models import Transaction, TransactionStatus, TransactionType


class TransactionRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, transaction: Transaction) -> Transaction:
        self.session.add(transaction)
        await self.session.flush()
        return transaction

    async def get_by_id(self, tx_id: uuid.UUID) -> Transaction | None:
        result = await self.session.execute(select(Transaction).where(Transaction.id == tx_id))
        return result.scalar_one_or_none()

    async def get_by_idempotency_key(self, key: str) -> Transaction | None:
        result = await self.session.execute(select(Transaction).where(Transaction.idempotency_key == key))
        return result.scalar_one_or_none()

    async def list_by_wallet(
        self,
        wallet_id: uuid.UUID,
        limit: int = 20,
        offset: int = 0,
        tx_type: TransactionType | None = None,
        status: TransactionStatus | None = None,
        from_date: datetime | None = None,
        to_date: datetime | None = None,
    ) -> tuple[list[Transaction], int]:
        query = select(Transaction).where(
            (Transaction.sender_wallet_id == wallet_id) | (Transaction.receiver_wallet_id == wallet_id)
        )

        if tx_type:
            query = query.where(Transaction.type == tx_type)
        if status:
            query = query.where(Transaction.status == status)
        if from_date:
            query = query.where(Transaction.created_at >= from_date)
        if to_date:
            query = query.where(Transaction.created_at <= to_date)

        count_query = query.with_only_columns(func.count())
        total_result = await self.session.execute(count_query)
        total = total_result.scalar() or 0

        query = query.order_by(Transaction.created_at.desc()).offset(offset).limit(limit)
        result = await self.session.execute(query)

        return list(result.scalars().all()), total

    async def get_statement(self, wallet_id: uuid.UUID, from_date: datetime, to_date: datetime) -> list[Transaction]:
        result = await self.session.execute(
            select(Transaction)
            .where(
                (Transaction.sender_wallet_id == wallet_id) | (Transaction.receiver_wallet_id == wallet_id),
                Transaction.created_at >= from_date,
                Transaction.created_at <= to_date,
                Transaction.status == TransactionStatus.SUCCESS,
            )
            .order_by(Transaction.created_at.asc())
        )
        return list(result.scalars().all())