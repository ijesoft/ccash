"""Admin-settable wallet daily send limit. Pure unit + DB audit test."""

import pytest

from app.core.errors import ValidationError
from app.domains.transactions.policy import (
    DEFAULT_DAILY_LIMIT_CENTS,
    MAX_DAILY_LIMIT_CENTS,
    MIN_DAILY_LIMIT_CENTS,
    validate_daily_limit,
)


def test_validate_daily_limit_rejects_bad_values():
    assert MIN_DAILY_LIMIT_CENTS == 100
    assert MAX_DAILY_LIMIT_CENTS == 100_000_000
    assert DEFAULT_DAILY_LIMIT_CENTS == 5_000_000

    # Valid boundaries pass without raising.
    validate_daily_limit(MIN_DAILY_LIMIT_CENTS)
    validate_daily_limit(DEFAULT_DAILY_LIMIT_CENTS)
    validate_daily_limit(MAX_DAILY_LIMIT_CENTS)

    bad_values = [
        True,
        False,
        5_000.5,
        "5000",
        None,
        0,
        -1,
        MIN_DAILY_LIMIT_CENTS - 1,
        MAX_DAILY_LIMIT_CENTS + 1,
    ]
    for bad in bad_values:
        with pytest.raises(ValidationError):
            validate_daily_limit(bad)


async def test_set_wallet_daily_limit_writes_audit(session, make_account):
    from sqlalchemy import select

    from app.core.audit import AuditLog
    from app.domains.admin.service import AdminService
    from app.domains.auth.models import UserRole

    target, wallet = await make_account()
    old_limit = wallet.daily_send_limit_cents
    old_version = wallet.version

    admin_user, _ = await make_account()
    admin_user.role = UserRole.ADMIN
    session.add(admin_user)
    await session.commit()

    new_limit = 1_000_000
    assert new_limit != old_limit

    service = AdminService(session)
    updated = await service.set_wallet_daily_limit(target.id, new_limit, admin_user.id)

    assert updated.daily_send_limit_cents == new_limit
    assert updated.version == old_version + 1

    rows = (
        (
            await session.execute(
                select(AuditLog).where(AuditLog.action == "wallet.limit.change")
            )
        )
        .scalars()
        .all()
    )
    assert len(rows) == 1
    log = rows[0]
    assert log.user_id == admin_user.id
    assert log.resource_type == "wallet"
    assert log.resource_id == str(wallet.id)
    assert log.old_values == {"daily_send_limit_cents": old_limit}
    assert log.new_values == {"daily_send_limit_cents": new_limit}


async def test_activate_user_with_limit_sets_wallet_and_audits(session, make_account):
    from sqlalchemy import select

    from app.core.audit import AuditLog
    from app.domains.admin.service import AdminService
    from app.domains.auth.models import UserRole, UserStatus

    target, wallet = await make_account()
    # make_account creates ACTIVE verified users; flip to PENDING for approval.
    target.status = UserStatus.PENDING
    target.is_verified = False
    session.add(target)
    await session.commit()

    admin_user, _ = await make_account()
    admin_user.role = UserRole.ADMIN
    session.add(admin_user)
    await session.commit()

    service = AdminService(session)
    user = await service.activate_user_as(
        target.id, admin_user.id, daily_send_limit_cents=2_500_000
    )

    assert user.status == UserStatus.ACTIVE
    await session.refresh(wallet)
    assert wallet.daily_send_limit_cents == 2_500_000

    rows = (
        (
            await session.execute(
                select(AuditLog).where(AuditLog.action == "wallet.limit.change")
            )
        )
        .scalars()
        .all()
    )
    assert len(rows) == 1
    assert rows[0].new_values == {"daily_send_limit_cents": 2_500_000}


def test_audit_summary_wallet_limit_change():
    from app.core.money import format_php
    from app.domains.admin.service import AdminService

    service = AdminService(None)  # type: ignore[arg-type]
    summary = service._audit_summary(
        "wallet.limit.change",
        {"daily_send_limit_cents": 2_500_000},
        {"daily_send_limit_cents": 5_000_000},
    )
    assert summary == f"daily limit {format_php(5_000_000)} → {format_php(2_500_000)}"


async def test_send_money_uses_updated_limit(session, make_account):
    import uuid

    from app.core.errors import DailyLimitExceededError
    from app.domains.admin.service import AdminService
    from app.domains.auth.models import UserRole
    from app.domains.transactions.service import TransactionService

    sender, _ = await make_account()  # default balance 100_000 covers the 5_000 send
    _, receiver_wallet = await make_account()

    admin_user, _ = await make_account()
    admin_user.role = UserRole.ADMIN
    session.add(admin_user)
    await session.commit()

    await AdminService(session).set_wallet_daily_limit(sender.id, 2_000, admin_user.id)

    with pytest.raises(DailyLimitExceededError):
        await TransactionService(session).send_money(
            sender.id, receiver_wallet.id, 5_000, str(uuid.uuid4())
        )
