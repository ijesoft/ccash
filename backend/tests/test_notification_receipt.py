"""Notifications expose their linked transaction for receipt viewing."""

import uuid

from sqlalchemy import text

from app.domains.notifications.graphql import NotificationType
from app.domains.notifications.models import Notification, NotificationType as ModelType
from app.domains.transactions.service import TransactionService


async def test_money_notification_exposes_transaction_id(session, make_account):
    _, sender_wallet = await make_account(balance_cents=500_000)
    _, receiver_wallet = await make_account()
    service = TransactionService(session)

    await service.send_money(sender_wallet.user_id, receiver_wallet.id, 5_000, str(uuid.uuid4()))

    result = await session.execute(text("SELECT id, data FROM notifications"))
    rows = result.all()
    assert rows, "send_money should create notifications"
    tx_ids = {(r.data or {}).get("transaction_id") for r in rows}
    assert None not in tx_ids and len(tx_ids) == 1

    notif = Notification(
        user_id=sender_wallet.user_id,
        type=ModelType.SENT,
        title="t",
        body="b",
        data={"transaction_id": next(iter(tx_ids))},
    )
    gql = NotificationType.from_model(notif)
    assert gql.transaction_id == next(iter(tx_ids))


async def test_non_money_notification_exposes_none(session, make_account):
    user, _ = await make_account()
    notif = Notification(
        user_id=user.id, type=ModelType.SECURITY, title="t", body="b", data=None
    )
    assert NotificationType.from_model(notif).transaction_id is None


async def test_legacy_notification_without_data_exposes_none(session, make_account):
    user, _ = await make_account()
    notif = Notification(
        user_id=user.id, type=ModelType.TRANSFER_RECEIVED, title="t", body="b", data=None
    )
    assert NotificationType.from_model(notif).transaction_id is None
