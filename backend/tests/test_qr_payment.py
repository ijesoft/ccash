"""QR payment invariants."""

import json
import uuid

import pytest
from sqlalchemy import text

from app.core.errors import ValidationError
from app.core.security import hash_password
from app.domains.transactions.service import TransactionService
from app.domains.wallets.models import Wallet
from app.domains.wallets.repository import ph


async def _set_pin(session, wallet: Wallet, pin: str = "1234") -> None:
    wallet.pin_hash = ph.hash(pin)
    session.add(wallet)
    await session.commit()


async def test_scan_qr_prefers_wallet_id_and_records_qr_type(session, make_account):
    _, sender_wallet = await make_account(balance_cents=500_000)
    receiver, receiver_wallet = await make_account(balance_cents=100_000)
    await _set_pin(session, sender_wallet)

    payload = json.dumps(
        {
            "v": 1,
            "type": "CCASH_PAY",
            "wallet_id": str(receiver_wallet.id),
            "to": receiver.phone,
            "name": "Receiver",
        }
    )
    service = TransactionService(session)
    view = await service.scan_qr_payment(
        sender_wallet.user_id,
        payload,
        str(uuid.uuid4()),
        amount_cents=2_500,
        pin="1234",
        description="qr lunch",
    )

    assert view.transaction.type.value == "QR_PAYMENT"
    assert view.transaction.amount_cents == 2_500
    assert view.transaction.receiver_wallet_id == receiver_wallet.id

    bal = await session.execute(
        text("SELECT balance_cents FROM wallets WHERE id = :id"),
        {"id": sender_wallet.id},
    )
    assert bal.scalar_one() == 497_500

    notif = await session.execute(
        text("SELECT type FROM notifications WHERE user_id = :uid"),
        {"uid": receiver_wallet.user_id},
    )
    assert notif.scalar_one() == "QR_PAYMENT"


async def test_scan_qr_treats_payload_amount_as_pesos(session, make_account):
    _, sender_wallet = await make_account(balance_cents=500_000)
    _, receiver_wallet = await make_account()
    await _set_pin(session, sender_wallet)

    payload = json.dumps(
        {
            "wallet_id": str(receiver_wallet.id),
            "amount": 50,
            "type": "CCASH_PAY",
        }
    )
    service = TransactionService(session)
    view = await service.scan_qr_payment(
        sender_wallet.user_id,
        payload,
        str(uuid.uuid4()),
        pin="1234",
    )
    assert view.transaction.amount_cents == 5_000


async def test_scan_qr_static_payload_requires_amount(session, make_account):
    _, sender_wallet = await make_account(balance_cents=500_000)
    _, receiver_wallet = await make_account()
    await _set_pin(session, sender_wallet)

    payload = json.dumps({"wallet_id": str(receiver_wallet.id), "type": "CCASH_PAY"})
    service = TransactionService(session)
    with pytest.raises(ValidationError, match="amount"):
        await service.scan_qr_payment(
            sender_wallet.user_id,
            payload,
            str(uuid.uuid4()),
            pin="1234",
        )


async def test_scan_qr_requires_pin_and_clear_error_when_unset(session, make_account):
    _, sender_wallet = await make_account(balance_cents=500_000)
    _, receiver_wallet = await make_account()
    payload = json.dumps({"wallet_id": str(receiver_wallet.id), "type": "CCASH_PAY"})
    service = TransactionService(session)

    with pytest.raises(ValidationError, match="MPIN is required"):
        await service.scan_qr_payment(
            sender_wallet.user_id,
            payload,
            str(uuid.uuid4()),
            amount_cents=100,
        )

    with pytest.raises(ValidationError, match="MPIN not set"):
        await service.scan_qr_payment(
            sender_wallet.user_id,
            payload,
            str(uuid.uuid4()),
            amount_cents=100,
            pin="1234",
        )


async def test_scan_qr_accepts_plain_mobile_payload(session, make_account):
    _, sender_wallet = await make_account(balance_cents=500_000)
    receiver, receiver_wallet = await make_account()
    await _set_pin(session, sender_wallet)

    service = TransactionService(session)
    view = await service.scan_qr_payment(
        sender_wallet.user_id,
        receiver.phone,
        str(uuid.uuid4()),
        amount_cents=1_000,
        pin="1234",
    )
    assert view.transaction.receiver_wallet_id == receiver_wallet.id
    assert view.transaction.type.value == "QR_PAYMENT"
