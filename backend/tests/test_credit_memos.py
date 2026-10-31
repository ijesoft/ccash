import re
import uuid

import pytest
from sqlalchemy import text

from app.core.errors import AuthorizationError, ValidationError
from app.core.rbac import Permission, has_permission
from app.domains.auth.models import UserRole
from app.domains.credit_memos.models import CreditMemoStatus
from app.domains.credit_memos.policy import (
    generate_credit_memo_reference,
    validate_credit_memo_amount,
)
from app.domains.credit_memos.service import CreditMemoService
from app.domains.notifications.models import NotificationType
from app.domains.transactions.models import TransactionType
from app.domains.transactions.service import TransactionService


def test_credit_memo_status_values():
    assert {s.value for s in CreditMemoStatus} == {
        "FOR_REVIEW",
        "CANCELLED",
        "DECLINED",
        "APPROVED",
    }


def test_credit_memo_reference_shape():
    reference = generate_credit_memo_reference()
    assert re.fullmatch(r"CM\d{6}[0-9A-HJKMNP-TV-Z]{8}", reference)
    assert generate_credit_memo_reference() != reference


def test_credit_memo_permissions():
    assert Permission.CREDIT_MEMO_READ.value == "credit-memo:read"
    assert Permission.CREDIT_MEMO_SUBMIT.value == "credit-memo:submit"
    assert Permission.CREDIT_MEMO_REVIEW.value == "credit-memo:review"
    assert has_permission(UserRole.MERCHANT, Permission.CREDIT_MEMO_READ)
    assert has_permission(UserRole.MERCHANT, Permission.CREDIT_MEMO_SUBMIT)
    assert not has_permission(UserRole.MERCHANT, Permission.CREDIT_MEMO_REVIEW)
    assert has_permission(UserRole.ADMIN, Permission.CREDIT_MEMO_REVIEW)
    assert has_permission(UserRole.SUPER_ADMIN, Permission.CREDIT_MEMO_READ)
    assert not has_permission(UserRole.MEMBER, Permission.CREDIT_MEMO_READ)
    assert not has_permission(UserRole.AUDITOR, Permission.CREDIT_MEMO_READ)


def test_new_enum_values_exist():
    assert TransactionType.CREDIT_MEMO.value == "CREDIT_MEMO"
    assert NotificationType.CREDIT_MEMO.value == "CREDIT_MEMO"


def test_credit_memo_amount_cap():
    validate_credit_memo_amount(
        5_000, transaction_amount_cents=10_000, already_credited_cents=0
    )
    with pytest.raises(ValidationError):
        validate_credit_memo_amount(0, 10_000, 0)
    with pytest.raises(ValidationError):
        validate_credit_memo_amount(11_000, 10_000, 0)
    with pytest.raises(ValidationError):
        validate_credit_memo_amount(6_000, 10_000, 5_000)


async def balance_of(session, wallet_id) -> int:
    result = await session.execute(
        text("SELECT balance_cents FROM wallets WHERE id = :id"), {"id": wallet_id}
    )
    return result.scalar_one()


async def make_payment(session, make_account, amount_cents: int = 10_000):
    customer, customer_wallet = await make_account(balance_cents=100_000)
    merchant, merchant_wallet = await make_account(
        balance_cents=100_000, role=UserRole.MERCHANT
    )
    view = await TransactionService(session).send_money(
        customer.id, merchant_wallet.id, amount_cents, str(uuid.uuid4()), "sale"
    )
    return customer, customer_wallet, merchant, merchant_wallet, view.transaction


async def test_merchant_submits_credit_memo(session, make_account):
    customer, customer_wallet, merchant, merchant_wallet, tx = await make_payment(
        session, make_account
    )
    service = CreditMemoService(session)

    view = await service.submit(
        merchant.id, tx.id, 3_000, "damaged item", str(uuid.uuid4())
    )

    assert view.memo.status == CreditMemoStatus.FOR_REVIEW
    assert view.memo.amount_cents == 3_000
    assert view.memo.merchant_user_id == merchant.id
    assert view.memo.customer_user_id == customer.id
    assert view.memo.customer_wallet_id == customer_wallet.id
    assert view.memo.reference.startswith("CM")


async def test_merchant_cannot_tag_outgoing_transaction(session, make_account):
    customer, customer_wallet = await make_account(balance_cents=100_000)
    merchant, merchant_wallet = await make_account(
        balance_cents=100_000, role=UserRole.MERCHANT
    )
    admin, admin_wallet = await make_account(balance_cents=0, role=UserRole.ADMIN)
    outgoing = await TransactionService(session).send_money(
        merchant.id, admin_wallet.id, 1_000, str(uuid.uuid4()), "remittance"
    )
    service = CreditMemoService(session)

    with pytest.raises(AuthorizationError):
        await service.submit(
            merchant.id, outgoing.transaction.id, 500, "wrong", str(uuid.uuid4())
        )


async def test_merchant_cannot_tag_another_merchants_payment(session, make_account):
    customer, _customer_wallet, _merchant, _merchant_wallet, tx = await make_payment(
        session, make_account
    )
    other_merchant, _ = await make_account(
        balance_cents=100_000, role=UserRole.MERCHANT
    )
    service = CreditMemoService(session)

    with pytest.raises(AuthorizationError):
        await service.submit(
            other_merchant.id, tx.id, 500, "not mine", str(uuid.uuid4())
        )


async def test_credit_memo_amount_cannot_exceed_remaining(session, make_account):
    _customer, _cw, merchant, _mw, tx = await make_payment(session, make_account)
    service = CreditMemoService(session)

    first = await service.submit(
        merchant.id, tx.id, 6_000, "first", str(uuid.uuid4())
    )
    with pytest.raises(ValidationError):
        await service.submit(merchant.id, tx.id, 5_000, "second", str(uuid.uuid4()))

    await service.cancel(merchant.id, first.memo.id)
    second = await service.submit(
        merchant.id, tx.id, 5_000, "second", str(uuid.uuid4())
    )
    assert second.memo.amount_cents == 5_000


async def test_merchant_cancel_only_while_for_review(session, make_account):
    _customer, _cw, merchant, _mw, tx = await make_payment(session, make_account)
    service = CreditMemoService(session)
    view = await service.submit(
        merchant.id, tx.id, 2_000, "reason", str(uuid.uuid4())
    )

    cancelled = await service.cancel(merchant.id, view.memo.id)
    assert cancelled.memo.status == CreditMemoStatus.CANCELLED

    with pytest.raises(ValidationError):
        await service.cancel(merchant.id, view.memo.id)


async def test_taggable_search_is_scoped_to_merchant(session, make_account):
    _customer, _cw, merchant, _mw, tx = await make_payment(session, make_account)
    other_merchant, _ = await make_account(
        balance_cents=100_000, role=UserRole.MERCHANT
    )
    service = CreditMemoService(session)

    mine = await service.search_taggable(merchant.id, tx.reference[-6:])
    theirs = await service.search_taggable(other_merchant.id, tx.reference[-6:])

    assert [item.transaction.id for item in mine] == [tx.id]
    assert mine[0].remaining_cents == 10_000
    assert theirs == []


async def test_non_merchant_cannot_submit(session, make_account):
    _customer, _cw, _merchant, _mw, tx = await make_payment(session, make_account)
    member, _ = await make_account(balance_cents=100_000)
    service = CreditMemoService(session)

    with pytest.raises(AuthorizationError):
        await service.submit(member.id, tx.id, 500, "nope", str(uuid.uuid4()))


from app.core.errors import InsufficientFundsError


async def test_admin_approval_moves_money_and_notifies(session, make_account):
    customer, customer_wallet, merchant, merchant_wallet, tx = await make_payment(
        session, make_account
    )
    admin, _ = await make_account(role=UserRole.ADMIN)
    service = CreditMemoService(session)
    submitted = await service.submit(
        merchant.id, tx.id, 3_000, "damaged item", str(uuid.uuid4())
    )

    approved = await service.approve(
        admin.id, submitted.memo.id, "approved", str(uuid.uuid4())
    )

    assert approved.memo.status == CreditMemoStatus.APPROVED
    assert approved.memo.refund_transaction_id is not None
    assert approved.refund_transaction is not None
    assert approved.refund_transaction.type == TransactionType.CREDIT_MEMO
    assert await balance_of(session, merchant_wallet.id) == 107_000
    assert await balance_of(session, customer_wallet.id) == 93_000
    assert merchant_wallet.daily_send_used_cents == 0
    notification_count = (
        await session.execute(
            text("SELECT count(*) FROM notifications WHERE type = 'CREDIT_MEMO'")
        )
    ).scalar_one()
    assert notification_count == 2


async def test_approval_blocked_when_merchant_has_insufficient_funds(
    session, make_account
):
    _customer, _cw, merchant, merchant_wallet, tx = await make_payment(
        session, make_account
    )
    admin, _ = await make_account(role=UserRole.ADMIN)
    service = CreditMemoService(session)
    submitted = await service.submit(
        merchant.id, tx.id, 3_000, "reason", str(uuid.uuid4())
    )
    merchant_wallet.balance_cents = 1_000
    session.add(merchant_wallet)
    await session.commit()

    with pytest.raises(InsufficientFundsError):
        await service.approve(
            admin.id, submitted.memo.id, None, str(uuid.uuid4())
        )

    refreshed = await service.get(admin.id, UserRole.ADMIN.value, submitted.memo.id)
    assert refreshed is not None
    assert refreshed.memo.status == CreditMemoStatus.FOR_REVIEW


async def test_double_approval_creates_one_refund(session, make_account):
    _customer, _cw, merchant, _mw, tx = await make_payment(session, make_account)
    admin, _ = await make_account(role=UserRole.ADMIN)
    service = CreditMemoService(session)
    submitted = await service.submit(
        merchant.id, tx.id, 1_000, "reason", str(uuid.uuid4())
    )

    await service.approve(admin.id, submitted.memo.id, None, str(uuid.uuid4()))
    await service.approve(admin.id, submitted.memo.id, None, str(uuid.uuid4()))

    count = (
        await session.execute(
            text("SELECT count(*) FROM transactions WHERE type = 'CREDIT_MEMO'")
        )
    ).scalar_one()
    assert count == 1


async def test_decline_requires_note_and_moves_no_money(session, make_account):
    _customer, customer_wallet, merchant, merchant_wallet, tx = await make_payment(
        session, make_account
    )
    admin, _ = await make_account(role=UserRole.ADMIN)
    service = CreditMemoService(session)
    submitted = await service.submit(
        merchant.id, tx.id, 2_000, "reason", str(uuid.uuid4())
    )

    with pytest.raises(ValidationError):
        await service.decline(admin.id, submitted.memo.id, "   ")

    declined = await service.decline(
        admin.id, submitted.memo.id, "Sale was final"
    )
    assert declined.memo.status == CreditMemoStatus.DECLINED
    assert await balance_of(session, merchant_wallet.id) == 110_000
    assert await balance_of(session, customer_wallet.id) == 90_000


async def test_non_admin_cannot_approve_or_decline(session, make_account):
    _customer, _cw, merchant, _mw, tx = await make_payment(session, make_account)
    service = CreditMemoService(session)
    submitted = await service.submit(
        merchant.id, tx.id, 2_000, "reason", str(uuid.uuid4())
    )

    with pytest.raises(AuthorizationError):
        await service.approve(
            merchant.id, submitted.memo.id, None, str(uuid.uuid4())
        )
    with pytest.raises(AuthorizationError):
        await service.decline(merchant.id, submitted.memo.id, "no")
