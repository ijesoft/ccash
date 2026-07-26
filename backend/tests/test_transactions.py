"""Transaction invariants.

Every test here corresponds to a defect found during the Phase 0 investigation.
If one of these regresses, money is wrong.
"""

import uuid

import pytest
from sqlalchemy import text

from app.core.errors import (
    AuthorizationError,
    DailyLimitExceededError,
    InsufficientFundsError,
    NotFoundError,
    ValidationError,
    WalletNotActiveError,
)
from app.domains.transactions.policy import MAX_TRANSACTION_CENTS, MIN_TRANSACTION_CENTS
from app.domains.transactions.service import TransactionService
from app.domains.transactions.views import TransactionDirection
from app.domains.wallets.models import WalletStatus


async def balance_of(session, wallet_id) -> int:
    result = await session.execute(
        text("SELECT balance_cents FROM wallets WHERE id = :id"), {"id": wallet_id}
    )
    return result.scalar_one()


# --------------------------------------------------------------- amount policy


@pytest.mark.parametrize("amount", [-100_000, -1, 0, MIN_TRANSACTION_CENTS - 1])
async def test_send_money_rejects_non_positive_amounts(session, make_account, amount):
    """A negative amount used to run the transfer backwards: it credited the
    sender and debited the recipient, returning SUCCESS."""
    _, sender_wallet = await make_account(balance_cents=500_000)
    receiver, receiver_wallet = await make_account(balance_cents=250_000)
    service = TransactionService(session)

    with pytest.raises(ValidationError):
        await service.send_money(
            sender_wallet.user_id, receiver_wallet.id, amount, str(uuid.uuid4())
        )

    assert await balance_of(session, sender_wallet.id) == 500_000
    assert await balance_of(session, receiver_wallet.id) == 250_000


async def test_send_money_rejects_amount_above_cap(session, make_account):
    _, sender_wallet = await make_account(balance_cents=MAX_TRANSACTION_CENTS * 2)
    _, receiver_wallet = await make_account()
    service = TransactionService(session)

    with pytest.raises(ValidationError):
        await service.send_money(
            sender_wallet.user_id,
            receiver_wallet.id,
            MAX_TRANSACTION_CENTS + 1,
            str(uuid.uuid4()),
        )


@pytest.mark.parametrize("amount", [-100_000, 0])
async def test_cash_in_rejects_non_positive_amounts(session, make_account, amount):
    """cash_in with a positive-only guard is what stops the wallet being minted
    into or drained without a corresponding transfer."""
    _, wallet = await make_account(balance_cents=100_000)
    service = TransactionService(session)

    with pytest.raises(ValidationError):
        await service.cash_in(wallet.user_id, amount, str(uuid.uuid4()))

    assert await balance_of(session, wallet.id) == 100_000


@pytest.mark.parametrize("amount", [-100_000, 0])
async def test_cash_out_rejects_non_positive_amounts(session, make_account, amount):
    _, wallet = await make_account(balance_cents=100_000)
    service = TransactionService(session)

    with pytest.raises(ValidationError):
        await service.cash_out(wallet.user_id, amount, str(uuid.uuid4()))

    assert await balance_of(session, wallet.id) == 100_000


async def test_database_rejects_negative_amount_directly(session, make_account):
    """Backstop: even a code path that skips validate_amount cannot persist a
    non-positive amount."""
    _, wallet = await make_account()

    with pytest.raises(Exception) as exc_info:
        await session.execute(
            text(
                "INSERT INTO transactions "
                "(id, idempotency_key, type, status, receiver_wallet_id, "
                " amount_cents, fee_cents, net_amount_cents, created_at, updated_at) "
                "VALUES (:id, :key, 'CASH_IN', 'SUCCESS', :wallet, -500, 0, -500, now(), now())"
            ),
            {"id": uuid.uuid4(), "key": str(uuid.uuid4()), "wallet": wallet.id},
        )
    assert "ck_transactions_amount_positive" in str(exc_info.value)
    await session.rollback()


# ------------------------------------------------------------------- transfers


async def test_send_money_moves_money_and_records_reference(session, make_account):
    _, sender_wallet = await make_account(balance_cents=500_000)
    _, receiver_wallet = await make_account(balance_cents=250_000)
    service = TransactionService(session)

    view = await service.send_money(
        sender_wallet.user_id, receiver_wallet.id, 5_000, str(uuid.uuid4()), "lunch"
    )

    assert view.transaction.status.value == "SUCCESS"
    assert view.transaction.reference.startswith("CC")
    assert await balance_of(session, sender_wallet.id) == 495_000
    assert await balance_of(session, receiver_wallet.id) == 255_000


async def test_send_money_rejects_self_transfer(session, make_account):
    """Balance-neutral, but it burned the daily limit and created a phantom row."""
    _, wallet = await make_account(balance_cents=500_000)
    service = TransactionService(session)

    with pytest.raises(ValidationError):
        await service.send_money(wallet.user_id, wallet.id, 1_000, str(uuid.uuid4()))

    assert await balance_of(session, wallet.id) == 500_000


async def test_send_money_rejects_insufficient_funds(session, make_account):
    _, sender_wallet = await make_account(balance_cents=1_000)
    _, receiver_wallet = await make_account(balance_cents=0)
    service = TransactionService(session)

    with pytest.raises(InsufficientFundsError):
        await service.send_money(
            sender_wallet.user_id, receiver_wallet.id, 5_000, str(uuid.uuid4())
        )

    assert await balance_of(session, receiver_wallet.id) == 0


async def test_send_money_enforces_daily_limit(session, make_account):
    _, sender_wallet = await make_account(
        balance_cents=500_000, daily_send_limit_cents=10_000, daily_send_used_cents=8_000
    )
    _, receiver_wallet = await make_account()
    service = TransactionService(session)

    with pytest.raises(DailyLimitExceededError):
        await service.send_money(
            sender_wallet.user_id, receiver_wallet.id, 5_000, str(uuid.uuid4())
        )


async def test_send_money_rejects_frozen_receiver(session, make_account):
    _, sender_wallet = await make_account(balance_cents=500_000)
    _, receiver_wallet = await make_account(status=WalletStatus.FROZEN)
    service = TransactionService(session)

    with pytest.raises(WalletNotActiveError):
        await service.send_money(
            sender_wallet.user_id, receiver_wallet.id, 5_000, str(uuid.uuid4())
        )


async def test_send_money_rejects_unknown_receiver(session, make_account):
    _, sender_wallet = await make_account(balance_cents=500_000)
    service = TransactionService(session)

    with pytest.raises(NotFoundError):
        await service.send_money(
            sender_wallet.user_id, uuid.uuid4(), 5_000, str(uuid.uuid4())
        )


async def test_replaying_an_idempotency_key_does_not_move_money_twice(session, make_account):
    _, sender_wallet = await make_account(balance_cents=500_000)
    _, receiver_wallet = await make_account(balance_cents=250_000)
    service = TransactionService(session)
    key = str(uuid.uuid4())

    first = await service.send_money(sender_wallet.user_id, receiver_wallet.id, 5_000, key)
    second = await service.send_money(sender_wallet.user_id, receiver_wallet.id, 5_000, key)

    assert first.transaction.id == second.transaction.id
    assert first.transaction.reference == second.transaction.reference
    assert await balance_of(session, sender_wallet.id) == 495_000
    assert await balance_of(session, receiver_wallet.id) == 255_000


async def test_references_are_unique_across_transactions(session, make_account):
    _, sender_wallet = await make_account(balance_cents=500_000)
    _, receiver_wallet = await make_account()
    service = TransactionService(session)

    references = set()
    for _ in range(5):
        view = await service.send_money(
            sender_wallet.user_id, receiver_wallet.id, 1_000, str(uuid.uuid4())
        )
        references.add(view.transaction.reference)

    assert len(references) == 5


# ------------------------------------------------------------------- direction


async def test_direction_is_relative_to_the_viewer(session, make_account):
    """The same row is OUT for the sender and IN for the recipient. Reading
    direction off `type` showed the recipient a red '-PHP 50.00 SEND'."""
    _, sender_wallet = await make_account(balance_cents=500_000)
    _, receiver_wallet = await make_account(balance_cents=250_000)
    service = TransactionService(session)

    await service.send_money(sender_wallet.user_id, receiver_wallet.id, 5_000, str(uuid.uuid4()))

    sender_views, _ = await service.list_transactions(sender_wallet.user_id)
    receiver_views, _ = await service.list_transactions(receiver_wallet.user_id)

    assert sender_views[0].direction is TransactionDirection.OUT
    assert receiver_views[0].direction is TransactionDirection.IN
    assert sender_views[0].transaction.id == receiver_views[0].transaction.id


async def test_counterparty_shows_the_other_party_masked(session, make_account):
    sender, sender_wallet = await make_account(balance_cents=500_000)
    receiver, receiver_wallet = await make_account()
    service = TransactionService(session)

    await service.send_money(sender_wallet.user_id, receiver_wallet.id, 5_000, str(uuid.uuid4()))

    sender_views, _ = await service.list_transactions(sender_wallet.user_id)
    receiver_views, _ = await service.list_transactions(receiver_wallet.user_id)

    assert sender_views[0].counterparty.wallet_id == receiver_wallet.id
    assert receiver_views[0].counterparty.wallet_id == sender_wallet.id
    # Recognisable, but not the full number.
    assert receiver_views[0].counterparty.masked_mobile.startswith(sender.phone[:4])
    assert sender.phone not in receiver_views[0].counterparty.masked_mobile
    assert "•" in receiver_views[0].counterparty.masked_mobile


async def test_cash_in_is_incoming_with_no_counterparty(session, make_account):
    _, wallet = await make_account()
    service = TransactionService(session)

    view = await service.cash_in(wallet.user_id, 10_000, str(uuid.uuid4()))

    assert view.direction is TransactionDirection.IN
    assert view.counterparty is None


async def test_cash_out_is_outgoing_with_no_counterparty(session, make_account):
    _, wallet = await make_account(balance_cents=100_000)
    service = TransactionService(session)

    view = await service.cash_out(wallet.user_id, 10_000, str(uuid.uuid4()))

    assert view.direction is TransactionDirection.OUT
    assert view.counterparty is None
    assert await balance_of(session, wallet.id) == 90_000


# --------------------------------------------------------------- notifications


async def test_transfer_notifies_both_parties(session, make_account):
    """The notification service and WebSocket manager were fully built but never
    called from the transaction flow, so a recipient was never told."""
    _, sender_wallet = await make_account(balance_cents=500_000)
    _, receiver_wallet = await make_account()
    service = TransactionService(session)

    await service.send_money(sender_wallet.user_id, receiver_wallet.id, 5_000, str(uuid.uuid4()))

    result = await session.execute(
        text("SELECT user_id, type, body FROM notifications ORDER BY type")
    )
    rows = result.all()

    by_user = {row.user_id: row for row in rows}
    assert by_user[receiver_wallet.user_id].type == "TRANSFER_RECEIVED"
    assert "received" in by_user[receiver_wallet.user_id].body.lower()
    assert by_user[sender_wallet.user_id].type == "SENT"
    assert "sent" in by_user[sender_wallet.user_id].body.lower()


async def test_failed_transfer_creates_no_notification(session, make_account):
    _, sender_wallet = await make_account(balance_cents=1_000)
    _, receiver_wallet = await make_account()
    service = TransactionService(session)

    with pytest.raises(InsufficientFundsError):
        await service.send_money(
            sender_wallet.user_id, receiver_wallet.id, 500_000, str(uuid.uuid4())
        )

    result = await session.execute(text("SELECT count(*) FROM notifications"))
    assert result.scalar_one() == 0


async def test_cash_in_and_cash_out_notify_the_owner(session, make_account):
    _, wallet = await make_account(balance_cents=100_000)
    service = TransactionService(session)

    await service.cash_in(wallet.user_id, 10_000, str(uuid.uuid4()))
    await service.cash_out(wallet.user_id, 5_000, str(uuid.uuid4()))

    result = await session.execute(
        text("SELECT type FROM notifications WHERE user_id = :uid"), {"uid": wallet.user_id}
    )
    assert {row.type for row in result.all()} == {"CASH_IN", "CASH_OUT"}


# ----------------------------------------------------------------- authorisation


async def test_cannot_read_another_users_transaction(session, make_account):
    """`transaction(id)` looked up by id with no ownership check."""
    _, sender_wallet = await make_account(balance_cents=500_000)
    _, receiver_wallet = await make_account()
    _, outsider_wallet = await make_account()
    service = TransactionService(session)

    view = await service.send_money(
        sender_wallet.user_id, receiver_wallet.id, 5_000, str(uuid.uuid4())
    )

    # Both parties can read it.
    assert (await service.get_transaction(view.transaction.id, sender_wallet.user_id)) is not None
    assert (await service.get_transaction(view.transaction.id, receiver_wallet.user_id)) is not None

    with pytest.raises(AuthorizationError):
        await service.get_transaction(view.transaction.id, outsider_wallet.user_id)
