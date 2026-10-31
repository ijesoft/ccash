import enum
import uuid

import strawberry
from strawberry.types import Info

from app.core.errors import (
    AuthorizationError,
    InsufficientFundsError,
    NotFoundError,
    ValidationError,
    WalletNotActiveError,
)
from app.core.masking import mask_mobile
from app.core.rbac import Permission
from app.database import async_session_factory
from app.domains.auth.models import User
from app.domains.credit_memos.service import (
    CreditMemoService,
    CreditMemoView,
    TaggableTransactionView,
)
from app.domains.transactions.models import Transaction
from app.graphql.middleware import AuthContext, require_perms
from app.graphql.scalars import Money, PaginationInfo

CREDIT_MEMO_ERRORS = (
    AuthorizationError,
    InsufficientFundsError,
    NotFoundError,
    ValidationError,
    WalletNotActiveError,
)


@strawberry.enum
class CreditMemoStatusEnum(str, enum.Enum):
    FOR_REVIEW = "FOR_REVIEW"
    CANCELLED = "CANCELLED"
    DECLINED = "DECLINED"
    APPROVED = "APPROVED"


@strawberry.type
class CreditMemoPartyType:
    user_id: str
    name: str | None
    email: str
    masked_mobile: str

    @classmethod
    def from_user(cls, user: User) -> "CreditMemoPartyType":
        name = f"{user.first_name or ''} {user.last_name or ''}".strip() or None
        return cls(
            user_id=str(user.id),
            name=name,
            email=user.email,
            masked_mobile=mask_mobile(user.phone),
        )


@strawberry.type
class CreditMemoType:
    id: str
    reference: str
    status: CreditMemoStatusEnum
    amount: Money
    reason: str
    admin_note: str | None
    merchant: CreditMemoPartyType
    customer: CreditMemoPartyType
    transaction_id: str
    transaction_reference: str | None
    transaction_amount: Money
    transaction_created_at: str
    refund_transaction_id: str | None
    refund_transaction_reference: str | None
    decided_by_email: str | None
    decided_at: str | None
    cancelled_at: str | None
    created_at: str

    @classmethod
    def from_view(cls, view: CreditMemoView) -> "CreditMemoType":
        memo = view.memo
        refund = view.refund_transaction
        return cls(
            id=str(memo.id),
            reference=memo.reference,
            status=CreditMemoStatusEnum(memo.status.value),
            amount=Money(amount=memo.amount_cents / 100, cents=memo.amount_cents),
            reason=memo.reason,
            admin_note=memo.admin_note,
            merchant=CreditMemoPartyType.from_user(view.merchant),
            customer=CreditMemoPartyType.from_user(view.customer),
            transaction_id=str(view.transaction.id),
            transaction_reference=view.transaction.reference,
            transaction_amount=Money(
                amount=view.transaction.amount_cents / 100,
                cents=view.transaction.amount_cents,
            ),
            transaction_created_at=view.transaction.created_at.isoformat()
            if view.transaction.created_at
            else "",
            refund_transaction_id=str(refund.id) if refund else None,
            refund_transaction_reference=refund.reference if refund else None,
            decided_by_email=view.decided_by.email if view.decided_by else None,
            decided_at=memo.decided_at.isoformat() if memo.decided_at else None,
            cancelled_at=memo.cancelled_at.isoformat() if memo.cancelled_at else None,
            created_at=memo.created_at.isoformat() if memo.created_at else "",
        )


@strawberry.type
class TaggableTransactionType:
    id: str
    reference: str | None
    amount: Money
    created_at: str
    customer_name: str | None
    customer_masked_mobile: str
    already_credited_cents: int
    remaining_creditable_cents: int

    @classmethod
    def from_view(
        cls, view: TaggableTransactionView
    ) -> "TaggableTransactionType":
        tx: Transaction = view.transaction
        customer = view.customer
        name = None
        if customer is not None:
            name = (
                f"{customer.first_name or ''} {customer.last_name or ''}".strip()
                or None
            )
        return cls(
            id=str(tx.id),
            reference=tx.reference,
            amount=Money(amount=tx.amount_cents / 100, cents=tx.amount_cents),
            created_at=tx.created_at.isoformat() if tx.created_at else "",
            customer_name=name,
            customer_masked_mobile=mask_mobile(customer.phone) if customer else "",
            already_credited_cents=view.credited_cents,
            remaining_creditable_cents=view.remaining_cents,
        )


@strawberry.type
class CreditMemoConnection:
    items: list[CreditMemoType]
    pagination: PaginationInfo


@strawberry.input
class SubmitCreditMemoInput:
    transaction_id: str
    amount_cents: int
    reason: str
    idempotency_key: str


def require_user(info: Info) -> uuid.UUID:
    context: AuthContext = info.context
    if not context.user_id:
        raise Exception("Not authenticated")
    return context.user_id


def _service() -> CreditMemoService:
    return CreditMemoService(async_session_factory())


@strawberry.type
class CreditMemoQueries:
    @strawberry.field
    async def credit_memos(
        self,
        info: Info,
        status: str | None = None,
        search: str | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> CreditMemoConnection:
        user_id = require_user(info)
        require_perms(info.context, Permission.CREDIT_MEMO_READ)
        service = _service()
        try:
            views, total = await service.list(
                user_id,
                info.context.role or "",
                status=status,
                search=search,
                limit=limit,
                offset=offset,
            )
            return CreditMemoConnection(
                items=[CreditMemoType.from_view(view) for view in views],
                pagination=PaginationInfo(
                    has_next=(offset + limit) < total,
                    has_previous=offset > 0,
                    total=total,
                ),
            )
        except CREDIT_MEMO_ERRORS as error:
            raise Exception(str(error))
        finally:
            await service.session.close()

    @strawberry.field
    async def credit_memo(
        self, info: Info, id: str
    ) -> CreditMemoType | None:
        user_id = require_user(info)
        require_perms(info.context, Permission.CREDIT_MEMO_READ)
        service = _service()
        try:
            view = await service.get(
                user_id, info.context.role or "", uuid.UUID(id)
            )
            return CreditMemoType.from_view(view) if view else None
        except CREDIT_MEMO_ERRORS as error:
            raise Exception(str(error))
        finally:
            await service.session.close()

    @strawberry.field
    async def credit_memo_taggable_transactions(
        self, info: Info, reference: str, limit: int = 10
    ) -> list[TaggableTransactionType]:
        user_id = require_user(info)
        require_perms(info.context, Permission.CREDIT_MEMO_SUBMIT)
        service = _service()
        try:
            views = await service.search_taggable(
                user_id, reference, limit=limit
            )
            return [TaggableTransactionType.from_view(view) for view in views]
        except CREDIT_MEMO_ERRORS as error:
            raise Exception(str(error))
        finally:
            await service.session.close()


@strawberry.type
class CreditMemoMutations:
    @strawberry.mutation
    async def submit_credit_memo(
        self, info: Info, input: SubmitCreditMemoInput
    ) -> CreditMemoType:
        user_id = require_user(info)
        require_perms(info.context, Permission.CREDIT_MEMO_SUBMIT)
        service = _service()
        try:
            view = await service.submit(
                user_id,
                uuid.UUID(input.transaction_id),
                input.amount_cents,
                input.reason,
                input.idempotency_key,
            )
            return CreditMemoType.from_view(view)
        except CREDIT_MEMO_ERRORS as error:
            raise Exception(str(error))
        finally:
            await service.session.close()

    @strawberry.mutation
    async def cancel_credit_memo(
        self, info: Info, id: str
    ) -> CreditMemoType:
        user_id = require_user(info)
        require_perms(info.context, Permission.CREDIT_MEMO_SUBMIT)
        service = _service()
        try:
            view = await service.cancel(user_id, uuid.UUID(id))
            return CreditMemoType.from_view(view)
        except CREDIT_MEMO_ERRORS as error:
            raise Exception(str(error))
        finally:
            await service.session.close()

    @strawberry.mutation
    async def approve_credit_memo(
        self, info: Info, id: str, note: str | None, idempotency_key: str
    ) -> CreditMemoType:
        user_id = require_user(info)
        require_perms(info.context, Permission.CREDIT_MEMO_REVIEW)
        service = _service()
        try:
            view = await service.approve(
                user_id, uuid.UUID(id), note, idempotency_key
            )
            return CreditMemoType.from_view(view)
        except CREDIT_MEMO_ERRORS as error:
            raise Exception(str(error))
        finally:
            await service.session.close()

    @strawberry.mutation
    async def decline_credit_memo(
        self, info: Info, id: str, note: str
    ) -> CreditMemoType:
        user_id = require_user(info)
        require_perms(info.context, Permission.CREDIT_MEMO_REVIEW)
        service = _service()
        try:
            view = await service.decline(user_id, uuid.UUID(id), note)
            return CreditMemoType.from_view(view)
        except CREDIT_MEMO_ERRORS as error:
            raise Exception(str(error))
        finally:
            await service.session.close()
