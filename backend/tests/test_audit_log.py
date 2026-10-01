"""Audit trail: money movements leave audit_logs rows; super-admin can list them.

The audit-log page (super-admin only) reads audit_logs, so every financial
mutation must buffer exactly one AuditLog row pre-commit (rolled-back
transfers leave none; idempotent replays leave no duplicate).
"""

import uuid

import pytest
from sqlalchemy import func, select

from app.core.audit import AuditLog
from app.domains.transactions.service import TransactionService


async def audit_rows(session):
    result = await session.execute(select(AuditLog).order_by(AuditLog.created_at))
    return result.scalars().all()


async def test_send_money_writes_audit_row(session, make_account):
    sender, _ = await make_account(balance_cents=500_000)
    _, receiver_wallet = await make_account()
    service = TransactionService(session)

    view = await service.send_money(sender.id, receiver_wallet.id, 150_000, str(uuid.uuid4()))

    rows = await audit_rows(session)
    assert len(rows) == 1
    row = rows[0]
    assert row.action == "transaction.send"
    assert row.resource_type == "transaction"
    assert row.user_id == sender.id
    assert row.resource_id == str(view.transaction.id)
    assert row.new_values["amount_cents"] == 150_000
    assert row.new_values["type"] == "SEND"
    assert row.new_values["status"] == "SUCCESS"
    assert row.new_values["reference"] == view.transaction.reference


async def test_idempotent_replay_does_not_duplicate_audit(session, make_account):
    sender, _ = await make_account(balance_cents=500_000)
    _, receiver_wallet = await make_account()
    service = TransactionService(session)
    key = str(uuid.uuid4())

    await service.send_money(sender.id, receiver_wallet.id, 50_000, key)
    await service.send_money(sender.id, receiver_wallet.id, 50_000, key)

    rows = await audit_rows(session)
    assert len(rows) == 1


async def test_cash_in_and_cash_out_write_audit_rows(session, make_account):
    user, wallet = await make_account()
    service = TransactionService(session)

    await service.cash_in(wallet.user_id, 10_000, str(uuid.uuid4()))
    await service.cash_out(wallet.user_id, 5_000, str(uuid.uuid4()))

    rows = await audit_rows(session)
    assert [r.action for r in rows] == ["transaction.cash_in", "transaction.cash_out"]
    assert rows[0].new_values["amount_cents"] == 10_000
    assert rows[1].new_values["amount_cents"] == 5_000
    assert all(r.user_id == user.id for r in rows)


async def test_list_audit_logs_filters_and_counts(session, make_account):
    from app.domains.admin.service import AdminService

    sender, _ = await make_account(balance_cents=500_000)
    _, receiver_wallet = await make_account()
    service = TransactionService(session)
    await service.send_money(sender.id, receiver_wallet.id, 25_000, str(uuid.uuid4()))
    await service.cash_in(sender.id, 10_000, str(uuid.uuid4()))

    admin_service = AdminService(session)
    items, total = await admin_service.list_audit_logs()
    assert total == 2
    assert len(items) == 2
    # Newest first.
    assert items[0]["action"] == "transaction.cash_in"
    assert items[0]["actor_email"] == sender.email
    assert "₱250.00" in items[1]["summary"]

    only_send, send_total = await admin_service.list_audit_logs(action="transaction.send")
    assert send_total == 1
    assert only_send[0]["action"] == "transaction.send"

    by_email, email_total = await admin_service.list_audit_logs(search=sender.email)
    assert email_total == 2

    missing, missing_total = await admin_service.list_audit_logs(search="nobody@ccash.test")
    assert missing_total == 0
    assert missing == []


async def test_audit_logs_query_rejects_non_super_admin():
    from app.domains.auth.models import UserRole
    from app.graphql.middleware import AuthContext, require_roles

    super_ctx = AuthContext()
    super_ctx.user_id = uuid.uuid4()
    super_ctx.role = UserRole.SUPER_ADMIN
    require_roles(super_ctx, UserRole.SUPER_ADMIN)  # must not raise

    for role in (UserRole.ADMIN, UserRole.MEMBER, UserRole.MERCHANT):
        ctx = AuthContext()
        ctx.user_id = uuid.uuid4()
        ctx.role = role
        with pytest.raises(Exception, match="Not authorized"):
            require_roles(ctx, UserRole.SUPER_ADMIN)
