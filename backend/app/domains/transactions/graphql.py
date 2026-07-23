import enum
import uuid
from datetime import datetime

import strawberry
from strawberry.types import Info

from app.core.errors import DailyLimitExceededError, InsufficientFundsError, NotFoundError, WalletNotActiveError
from app.database import async_session_factory
from app.domains.transactions.models import Transaction
from app.domains.transactions.service import TransactionService
from app.graphql.middleware import AuthContext
from app.graphql.scalars import Money, PaginationInfo


@strawberry.enum
class TransactionTypeEnum(str, enum.Enum):
    CASH_IN = "CASH_IN"
    CASH_OUT = "CASH_OUT"
    SEND = "SEND"
    RECEIVE = "RECEIVE"
    QR_PAYMENT = "QR_PAYMENT"


@strawberry.enum
class TransactionStatusEnum(str, enum.Enum):
    PENDING = "PENDING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    REVERSED = "REVERSED"


@strawberry.type
class TransactionType:
    id: str
    type: str
    status: str
    sender_wallet_id: str | None
    receiver_wallet_id: str | None
    amount: Money
    fee: Money
    net_amount: Money
    reference: str | None
    description: str | None
    created_at: str

    @classmethod
    def from_model(cls, tx: Transaction) -> "TransactionType":
        return cls(
            id=str(tx.id),
            type=tx.type.value,
            status=tx.status.value,
            sender_wallet_id=str(tx.sender_wallet_id) if tx.sender_wallet_id else None,
            receiver_wallet_id=str(tx.receiver_wallet_id) if tx.receiver_wallet_id else None,
            amount=Money(amount=tx.amount_cents / 100, cents=tx.amount_cents),
            fee=Money(amount=tx.fee_cents / 100, cents=tx.fee_cents),
            net_amount=Money(amount=tx.net_amount_cents / 100, cents=tx.net_amount_cents),
            reference=tx.reference,
            description=tx.description,
            created_at=tx.created_at.isoformat() if tx.created_at else "",
        )


@strawberry.type
class TransactionConnection:
    items: list[TransactionType]
    pagination: PaginationInfo


@strawberry.input
class SendMoneyInput:
    receiver_wallet_id: str
    amount_cents: int
    idempotency_key: str
    description: str | None = None


@strawberry.input
class CashInInput:
    amount_cents: int
    idempotency_key: str
    description: str | None = None


@strawberry.input
class CashOutInput:
    amount_cents: int
    idempotency_key: str
    description: str | None = None


async def get_tx_service(info: Info) -> TransactionService:
    session = async_session_factory()
    return TransactionService(session)


@strawberry.type
class TransactionQueries:
    @strawberry.field
    async def transactions(
        self, info: Info, limit: int = 20, offset: int = 0, tx_type: str | None = None, status: str | None = None
    ) -> TransactionConnection:
        context: AuthContext = info.context
        if not context.user_id:
            raise Exception("Not authenticated")

        service = await get_tx_service(info)
        try:
            items, total = await service.list_transactions(context.user_id, limit, offset, tx_type, status)
            return TransactionConnection(
                items=[TransactionType.from_model(tx) for tx in items],
                pagination=PaginationInfo(has_next=(offset + limit) < total, has_previous=offset > 0, total=total),
            )
        finally:
            await service.session.close()

    @strawberry.field
    async def transaction(self, info: Info, id: str) -> TransactionType | None:
        context: AuthContext = info.context
        if not context.user_id:
            raise Exception("Not authenticated")

        service = await get_tx_service(info)
        try:
            tx = await service.get_transaction(uuid.UUID(id))
            return TransactionType.from_model(tx)
        except NotFoundError:
            return None
        finally:
            await service.session.close()

    @strawberry.field
    async def statement(self, info: Info, from_date: str, to_date: str) -> list[TransactionType]:
        context: AuthContext = info.context
        if not context.user_id:
            raise Exception("Not authenticated")

        service = await get_tx_service(info)
        try:
            from_dt = datetime.fromisoformat(from_date)
            to_dt = datetime.fromisoformat(to_date)
            txs = await service.get_statement(context.user_id, from_dt, to_dt)
            return [TransactionType.from_model(tx) for tx in txs]
        finally:
            await service.session.close()


@strawberry.type
class TransactionMutations:
    @strawberry.mutation
    async def send_money(self, info: Info, input: SendMoneyInput) -> TransactionType:
        context: AuthContext = info.context
        if not context.user_id:
            raise Exception("Not authenticated")

        service = await get_tx_service(info)
        try:
            tx = await service.send_money(
                context.user_id,
                uuid.UUID(input.receiver_wallet_id),
                input.amount_cents,
                input.idempotency_key,
                input.description,
            )
            return TransactionType.from_model(tx)
        except (NotFoundError, InsufficientFundsError, DailyLimitExceededError, WalletNotActiveError) as e:
            raise Exception(str(e))
        finally:
            await service.session.close()

    @strawberry.mutation
    async def cash_in(self, info: Info, input: CashInInput) -> TransactionType:
        context: AuthContext = info.context
        if not context.user_id:
            raise Exception("Not authenticated")

        service = await get_tx_service(info)
        try:
            tx = await service.cash_in(context.user_id, input.amount_cents, input.idempotency_key, input.description)
            return TransactionType.from_model(tx)
        except NotFoundError as e:
            raise Exception(str(e))
        finally:
            await service.session.close()

    @strawberry.mutation
    async def cash_out(self, info: Info, input: CashOutInput) -> TransactionType:
        context: AuthContext = info.context
        if not context.user_id:
            raise Exception("Not authenticated")

        service = await get_tx_service(info)
        try:
            tx = await service.cash_out(context.user_id, input.amount_cents, input.idempotency_key, input.description)
            return TransactionType.from_model(tx)
        except (NotFoundError, InsufficientFundsError) as e:
            raise Exception(str(e))
        finally:
            await service.session.close()