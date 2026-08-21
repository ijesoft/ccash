import enum
import uuid
from datetime import datetime

import strawberry
from strawberry.types import Info

from app.core.errors import (
    AuthorizationError,
    DailyLimitExceededError,
    InsufficientFundsError,
    NotFoundError,
    ValidationError,
    WalletNotActiveError,
)
from app.database import async_session_factory
from app.domains.transactions.service import TransactionService
from app.domains.transactions.views import TransactionView
from app.graphql.middleware import AuthContext, require_admin
from app.graphql.scalars import Money, PaginationInfo

# Errors that describe a rejected-but-valid request. Anything not listed here is
# a bug and should surface as an unhandled error rather than a tidy message.
TRANSACTION_ERRORS = (
    AuthorizationError,
    DailyLimitExceededError,
    InsufficientFundsError,
    NotFoundError,
    ValidationError,
    WalletNotActiveError,
)


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


@strawberry.enum
class TransactionDirectionEnum(str, enum.Enum):
    """Whether the transaction moved money into or out of the caller's wallet.

    Resolved per request. Clients must render sign and colour from this, never
    from `type` — a SEND row is outgoing for the sender and incoming for the
    recipient.
    """

    IN = "IN"
    OUT = "OUT"


@strawberry.type
class CounterpartyType:
    wallet_id: str
    name: str | None
    masked_mobile: str


@strawberry.type
class TransactionType:
    id: str
    type: str
    status: str
    direction: TransactionDirectionEnum
    counterparty: CounterpartyType | None
    sender_wallet_id: str | None
    receiver_wallet_id: str | None
    amount: Money
    fee: Money
    net_amount: Money
    reference: str | None
    description: str | None
    created_at: str

    @classmethod
    def from_view(cls, view: TransactionView) -> "TransactionType":
        tx = view.transaction
        return cls(
            id=str(tx.id),
            type=tx.type.value,
            status=tx.status.value,
            direction=TransactionDirectionEnum(view.direction.value),
            counterparty=(
                CounterpartyType(
                    wallet_id=str(view.counterparty.wallet_id),
                    name=view.counterparty.name,
                    masked_mobile=view.counterparty.masked_mobile,
                )
                if view.counterparty
                else None
            ),
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
    receiver_wallet_id: str | None = None
    receiver_mobile: str | None = None
    amount_cents: int
    idempotency_key: str
    description: str | None = None
    pin: str | None = None


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


@strawberry.input
class RequestMoneyInput:
    receiver_wallet_id: str
    amount_cents: int
    idempotency_key: str
    description: str | None = None


async def get_tx_service(info: Info) -> TransactionService:
    session = async_session_factory()
    return TransactionService(session)


def require_user(info: Info) -> uuid.UUID:
    context: AuthContext = info.context
    if not context.user_id:
        raise Exception("Not authenticated")
    return context.user_id


@strawberry.type
class QrCodeType:
    payload: str


@strawberry.type
class TransactionQueries:
    @strawberry.field
    async def transactions(
        self, info: Info, limit: int = 20, offset: int = 0, tx_type: str | None = None, status: str | None = None
    ) -> TransactionConnection:
        user_id = require_user(info)

        service = await get_tx_service(info)
        try:
            views, total = await service.list_transactions(user_id, limit, offset, tx_type, status)
            return TransactionConnection(
                items=[TransactionType.from_view(view) for view in views],
                pagination=PaginationInfo(has_next=(offset + limit) < total, has_previous=offset > 0, total=total),
            )
        finally:
            await service.session.close()

    @strawberry.field
    async def transaction(self, info: Info, id: str) -> TransactionType | None:
        user_id = require_user(info)

        service = await get_tx_service(info)
        try:
            view = await service.get_transaction(uuid.UUID(id), user_id)
            return TransactionType.from_view(view)
        except (NotFoundError, AuthorizationError):
            # Deliberately indistinguishable: a caller must not be able to probe
            # which transaction ids exist.
            return None
        finally:
            await service.session.close()

    @strawberry.field
    async def statement(self, info: Info, from_date: str, to_date: str) -> list[TransactionType]:
        user_id = require_user(info)

        service = await get_tx_service(info)
        try:
            from_dt = datetime.fromisoformat(from_date)
            to_dt = datetime.fromisoformat(to_date)
            views = await service.get_statement(user_id, from_dt, to_dt)
            return [TransactionType.from_view(view) for view in views]
        finally:
            await service.session.close()

    @strawberry.field
    async def my_qr_code(self, info: Info) -> QrCodeType:
        user_id = require_user(info)

        from app.domains.wallets.service import WalletService

        service = await get_tx_service(info)
        wallet_service = WalletService(service.session)
        try:
            wallet = await wallet_service.get_or_create_wallet(user_id)
            payload = f'{{"to":"{wallet.id}","amount":0}}'
            return QrCodeType(payload=payload)
        finally:
            await service.session.close()


@strawberry.type
class TransactionMutations:
    @strawberry.mutation
    async def send_money(self, info: Info, input: SendMoneyInput) -> TransactionType:
        user_id = require_user(info)

        service = await get_tx_service(info)
        try:
            view = await service.send_money(
                user_id,
                uuid.UUID(input.receiver_wallet_id) if input.receiver_wallet_id else None,
                input.amount_cents,
                input.idempotency_key,
                input.description,
                receiver_mobile=input.receiver_mobile,
                pin=input.pin,
            )
            return TransactionType.from_view(view)
        except TRANSACTION_ERRORS as e:
            raise Exception(str(e))
        finally:
            await service.session.close()

    @strawberry.mutation
    async def cash_in(self, info: Info, input: CashInInput) -> TransactionType:
        user_id = require_user(info)
        require_admin(info.context)

        service = await get_tx_service(info)
        try:
            view = await service.cash_in(
                user_id, input.amount_cents, input.idempotency_key, input.description
            )
            return TransactionType.from_view(view)
        except TRANSACTION_ERRORS as e:
            raise Exception(str(e))
        finally:
            await service.session.close()

    @strawberry.mutation
    async def cash_out(self, info: Info, input: CashOutInput) -> TransactionType:
        user_id = require_user(info)
        require_admin(info.context)

        service = await get_tx_service(info)
        try:
            view = await service.cash_out(
                user_id, input.amount_cents, input.idempotency_key, input.description
            )
            return TransactionType.from_view(view)
        except TRANSACTION_ERRORS as e:
            raise Exception(str(e))
        finally:
            await service.session.close()

    @strawberry.mutation
    async def scan_qr_payment(self, info: Info, payload: str, idempotency_key: str, pin: str | None = None) -> TransactionType:
        user_id = require_user(info)

        service = await get_tx_service(info)
        try:
            view = await service.scan_qr_payment(user_id, payload, idempotency_key, pin=pin)
            return TransactionType.from_view(view)
        except TRANSACTION_ERRORS as e:
            raise Exception(str(e))
        finally:
            await service.session.close()

    @strawberry.mutation
    async def request_money(self, info: Info, input: RequestMoneyInput) -> TransactionType:
        user_id = require_user(info)

        service = await get_tx_service(info)
        try:
            view = await service.request_money(
                user_id,
                uuid.UUID(input.receiver_wallet_id),
                input.amount_cents,
                input.idempotency_key,
                input.description,
            )
            return TransactionType.from_view(view)
        except TRANSACTION_ERRORS as e:
            raise Exception(str(e))
        finally:
            await service.session.close()

    @strawberry.mutation
    async def respond_to_request(self, info: Info, tx_id: str, approve: bool) -> TransactionType:
        user_id = require_user(info)

        service = await get_tx_service(info)
        try:
            view = await service.respond_to_request(user_id, uuid.UUID(tx_id), approve)
            return TransactionType.from_view(view)
        except TRANSACTION_ERRORS as e:
            raise Exception(str(e))
        finally:
            await service.session.close()






