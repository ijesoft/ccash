from app.core.rbac import ROLE_PERMISSIONS
from app.domains.auth.models import UserRole


def test_auditor_role_exists():
    assert UserRole.AUDITOR.value == "AUDITOR"


def test_auditor_permission_set_is_exact():
    from app.core.rbac import ROLE_PERMISSIONS
    granted = {p.value for p in ROLE_PERMISSIONS[UserRole.AUDITOR]}
    assert granted == {
        "platform:stats",
        "users:read",
        "merchants:read",
        "transactions:read-all",
        "audit:read",
    }


def test_auditor_permission_rows_seeded():
    """010 seeds role_permissions rows; documents the expected set."""
    expected = {
        "platform:stats",
        "users:read",
        "merchants:read",
        "transactions:read-all",
        "audit:read",
    }
    import pathlib

    text = pathlib.Path("migrations/versions/010_add_auditor_role.py").read_text()
    for perm in expected:
        assert perm in text
    assert "AUDITOR" in text


async def test_auditor_has_no_wallet(session):
    from app.core.errors import ValidationError
    from app.core.security import hash_password
    from app.domains.auth.models import User, UserStatus
    from app.domains.wallets.service import WalletService
    import pytest

    auditor = User(
        email="auditor@ccash.test",
        phone="09180009999",
        password_hash=hash_password("Test123!"),
        status=UserStatus.ACTIVE,
        is_verified=True,
        role=UserRole.AUDITOR,
    )
    session.add(auditor)
    await session.flush()
    with pytest.raises(ValidationError, match="Super admin"):
        await WalletService(session).get_or_create_wallet_for_role(auditor.id, auditor.role)
    with pytest.raises(ValidationError, match="Super admin"):
        await WalletService(session).get_or_create_wallet(auditor.id)


async def test_auditor_can_read_audit_logs(session, monkeypatch):
    """AUDITOR carries audit:read, so the auditLogs resolvers must let them through.

    Pattern: no GraphQL-client fixture exists in this repo (see
    tests/test_audit_log.py + tests/test_auth_change_password.py) — tests call
    the service for data and the strawberry resolver directly with a FakeInfo
    carrying an AuthContext. get_admin_service is monkeypatched to reuse the
    test session instead of opening a real pool session.
    """
    import uuid

    import app.domains.admin.graphql as admin_gql
    from app.core.rbac import permissions_for
    from app.domains.admin.service import AdminService
    from app.graphql.middleware import AuthContext

    async def fake_get_admin_service(info):
        return AdminService(session)

    monkeypatch.setattr(admin_gql, "get_admin_service", fake_get_admin_service)

    class FakeInfo:
        context = AuthContext()

    FakeInfo.context.user_id = uuid.uuid4()
    FakeInfo.context.role = UserRole.AUDITOR.value
    FakeInfo.context.scopes = ["wallet:read", "wallet:write"] + permissions_for(
        UserRole.AUDITOR
    )
    assert "audit:read" in FakeInfo.context.scopes

    result = await admin_gql.AdminQueries().audit_logs(FakeInfo(), limit=1)  # type: ignore
    assert isinstance(result, list)

    total = await admin_gql.AdminQueries().audit_logs_count(FakeInfo())  # type: ignore
    assert isinstance(total, int)


async def test_admin_still_blocked_from_audit_logs(session, monkeypatch):
    """ADMIN rows (migration 009) have no audit:read, so auditLogs must reject them."""
    import uuid

    import pytest

    import app.domains.admin.graphql as admin_gql
    from app.domains.admin.service import AdminService
    from app.graphql.middleware import AuthContext

    async def fake_get_admin_service(info):
        return AdminService(session)

    monkeypatch.setattr(admin_gql, "get_admin_service", fake_get_admin_service)

    class FakeInfo:
        context = AuthContext()

    FakeInfo.context.user_id = uuid.uuid4()
    FakeInfo.context.role = UserRole.ADMIN.value
    # Mirrors DB-backed ADMIN scopes: broad but without audit:read (009 seeds
    # no audit:read row for ADMIN; SUPER_ADMIN is synthesized, ADMIN is not).
    FakeInfo.context.scopes = ["wallet:read", "wallet:write", "users:read", "admin"]
    assert "audit:read" not in FakeInfo.context.scopes

    with pytest.raises(Exception, match="Not authorized"):
        await admin_gql.AdminQueries().audit_logs(FakeInfo(), limit=1)  # type: ignore

    with pytest.raises(Exception, match="Not authorized"):
        await admin_gql.AdminQueries().audit_logs_count(FakeInfo())  # type: ignore


async def test_admin_all_transactions_returns_platform_feed(session, make_account, monkeypatch):
    """AUDITOR with transactions:read-all sees the platform-wide ledger with
    both-side labels."""
    import uuid

    import app.domains.admin.graphql as admin_gql
    from app.core.rbac import permissions_for
    from app.domains.admin.service import AdminService
    from app.domains.auth.models import UserRole
    from app.domains.transactions.service import TransactionService
    from app.graphql.middleware import AuthContext

    _, sender_wallet = await make_account(balance_cents=500_000)
    _, receiver_wallet = await make_account(balance_cents=250_000)
    service = TransactionService(session)
    await service.send_money(
        sender_wallet.user_id, receiver_wallet.id, 5_000, str(uuid.uuid4())
    )

    async def fake_get_admin_service(info):
        return AdminService(session)

    monkeypatch.setattr(admin_gql, "get_admin_service", fake_get_admin_service)

    class FakeInfo:
        context = AuthContext()

    FakeInfo.context.user_id = uuid.uuid4()
    FakeInfo.context.role = UserRole.AUDITOR.value
    FakeInfo.context.scopes = ["wallet:read", "wallet:write"] + permissions_for(
        UserRole.AUDITOR
    )
    assert "transactions:read-all" in FakeInfo.context.scopes

    result = await admin_gql.AdminQueries().admin_all_transactions(  # type: ignore
        FakeInfo(), limit=5, offset=0
    )
    assert result.total >= 1
    assert len(result.items) >= 1
    row = result.items[0]
    assert row.reference
    assert row.type
    assert row.status
    assert row.sender
    assert row.receiver


async def test_member_blocked_from_all_transactions(session, make_account, monkeypatch):
    """MEMBER has no transactions:read-all, so the ledger must reject them."""
    import uuid

    import pytest

    import app.domains.admin.graphql as admin_gql
    from app.domains.admin.service import AdminService
    from app.domains.auth.models import UserRole
    from app.graphql.middleware import AuthContext

    async def fake_get_admin_service(info):
        return AdminService(session)

    monkeypatch.setattr(admin_gql, "get_admin_service", fake_get_admin_service)

    class FakeInfo:
        context = AuthContext()

    FakeInfo.context.user_id = uuid.uuid4()
    FakeInfo.context.role = UserRole.MEMBER.value
    FakeInfo.context.scopes = ["wallet:read", "wallet:write"]
    assert "transactions:read-all" not in FakeInfo.context.scopes

    with pytest.raises(Exception, match="Not authorized"):
        await admin_gql.AdminQueries().admin_all_transactions(  # type: ignore
            FakeInfo(), limit=5, offset=0
        )


async def test_auditor_can_read_platform_stats(session, monkeypatch):
    """Control: AUDITOR carries platform:stats, so platform_stats must succeed."""
    import uuid

    import app.domains.admin.graphql as admin_gql
    from app.core.rbac import permissions_for
    from app.domains.admin.service import AdminService
    from app.domains.auth.models import UserRole
    from app.graphql.middleware import AuthContext

    async def fake_get_admin_service(info):
        return AdminService(session)

    monkeypatch.setattr(admin_gql, "get_admin_service", fake_get_admin_service)

    class FakeInfo:
        context = AuthContext()

    FakeInfo.context.user_id = uuid.uuid4()
    FakeInfo.context.role = UserRole.AUDITOR.value
    FakeInfo.context.scopes = ["wallet:read", "wallet:write"] + permissions_for(
        UserRole.AUDITOR
    )
    assert "platform:stats" in FakeInfo.context.scopes

    result = await admin_gql.AdminQueries().platform_stats(FakeInfo())  # type: ignore
    assert result.total_users >= 0
    assert result.total_wallet_balance_cents >= 0


async def test_auditor_cannot_send_money(session, make_account, monkeypatch):
    """AUDITOR has no wallet (Task 3), so send_money must fail even though the
    resolver itself carries no perm guard — denial comes from the missing
    sender wallet."""
    import uuid

    import pytest

    import app.domains.transactions.graphql as tx_gql
    from app.core.rbac import permissions_for
    from app.core.security import hash_password
    from app.domains.auth.models import User, UserRole, UserStatus
    from app.domains.transactions.service import TransactionService
    from app.graphql.middleware import AuthContext

    auditor = User(
        email="auditor-send@ccash.test",
        phone="09180009991",
        password_hash=hash_password("Test123!"),
        status=UserStatus.ACTIVE,
        is_verified=True,
        role=UserRole.AUDITOR,
    )
    session.add(auditor)
    await session.flush()
    _, receiver_wallet = await make_account(balance_cents=250_000)

    async def fake_get_tx_service(info):
        return TransactionService(session)

    monkeypatch.setattr(tx_gql, "get_tx_service", fake_get_tx_service)

    class FakeInfo:
        context = AuthContext()

    FakeInfo.context.user_id = auditor.id
    FakeInfo.context.role = UserRole.AUDITOR.value
    FakeInfo.context.scopes = ["wallet:read", "wallet:write"] + permissions_for(
        UserRole.AUDITOR
    )
    assert "cash:operate" not in FakeInfo.context.scopes

    with pytest.raises(Exception, match="Sender wallet not found"):
        await tx_gql.TransactionMutations().send_money(  # type: ignore
            FakeInfo(),
            tx_gql.SendMoneyInput(
                receiver_wallet_id=str(receiver_wallet.id),
                amount_cents=5_000,
                idempotency_key=str(uuid.uuid4()),
            ),
        )


async def test_auditor_cannot_cash_in(monkeypatch):
    """cash_in requires cash:operate, which AUDITOR lacks."""
    import uuid

    import pytest

    import app.domains.transactions.graphql as tx_gql
    from app.core.rbac import permissions_for
    from app.domains.auth.models import UserRole
    from app.graphql.middleware import AuthContext

    class FakeInfo:
        context = AuthContext()

    FakeInfo.context.user_id = uuid.uuid4()
    FakeInfo.context.role = UserRole.AUDITOR.value
    FakeInfo.context.scopes = ["wallet:read", "wallet:write"] + permissions_for(
        UserRole.AUDITOR
    )
    assert "cash:operate" not in FakeInfo.context.scopes

    with pytest.raises(Exception, match="Not authorized"):
        await tx_gql.TransactionMutations().cash_in(  # type: ignore
            FakeInfo(),
            tx_gql.CashInInput(
                amount_cents=5_000, idempotency_key=str(uuid.uuid4())
            ),
        )


async def test_auditor_cannot_suspend_user(session, make_account, monkeypatch):
    """suspend_user requires users:suspend, which AUDITOR lacks."""
    import pytest

    import app.domains.admin.graphql as admin_gql
    from app.core.rbac import permissions_for
    from app.domains.admin.service import AdminService
    from app.domains.auth.models import UserRole
    from app.graphql.middleware import AuthContext
    import uuid

    target, _ = await make_account()

    async def fake_get_admin_service(info):
        return AdminService(session)

    monkeypatch.setattr(admin_gql, "get_admin_service", fake_get_admin_service)

    class FakeInfo:
        context = AuthContext()

    FakeInfo.context.user_id = uuid.uuid4()
    FakeInfo.context.role = UserRole.AUDITOR.value
    FakeInfo.context.scopes = ["wallet:read", "wallet:write"] + permissions_for(
        UserRole.AUDITOR
    )
    assert "users:suspend" not in FakeInfo.context.scopes

    with pytest.raises(Exception, match="Not authorized"):
        await admin_gql.AdminMutations().suspend_user(  # type: ignore
            FakeInfo(), user_id=str(target.id)
        )


async def test_auditor_cannot_update_user_role(session, make_account, monkeypatch):
    """update_user_role requires users:change-role, which AUDITOR lacks."""
    import uuid

    import pytest

    import app.domains.admin.graphql as admin_gql
    from app.core.rbac import permissions_for
    from app.domains.admin.service import AdminService
    from app.domains.auth.models import UserRole
    from app.graphql.middleware import AuthContext

    target, _ = await make_account()

    async def fake_get_admin_service(info):
        return AdminService(session)

    monkeypatch.setattr(admin_gql, "get_admin_service", fake_get_admin_service)

    class FakeInfo:
        context = AuthContext()

    FakeInfo.context.user_id = uuid.uuid4()
    FakeInfo.context.role = UserRole.AUDITOR.value
    FakeInfo.context.scopes = ["wallet:read", "wallet:write"] + permissions_for(
        UserRole.AUDITOR
    )
    assert "users:change-role" not in FakeInfo.context.scopes

    with pytest.raises(Exception, match="Not authorized"):
        await admin_gql.AdminMutations().update_user_role(  # type: ignore
            FakeInfo(),
            user_id=str(target.id),
            role=admin_gql.UserRoleEnum.MEMBER,
        )


async def test_auditor_cannot_review_kyc(monkeypatch):
    """approve_kyc/reject_kyc require kyc:review, which AUDITOR lacks."""
    import uuid

    import pytest

    import app.domains.users.graphql as kyc_gql
    from app.core.rbac import permissions_for
    from app.domains.auth.models import UserRole
    from app.graphql.middleware import AuthContext

    class FakeInfo:
        context = AuthContext()

    FakeInfo.context.user_id = uuid.uuid4()
    FakeInfo.context.role = UserRole.AUDITOR.value
    FakeInfo.context.scopes = ["wallet:read", "wallet:write"] + permissions_for(
        UserRole.AUDITOR
    )
    assert "kyc:review" not in FakeInfo.context.scopes

    with pytest.raises(Exception, match="Not authorized"):
        await kyc_gql.KycMutations().approve_kyc(  # type: ignore
            FakeInfo(), document_id=str(uuid.uuid4())
        )

    with pytest.raises(Exception, match="Not authorized"):
        await kyc_gql.KycMutations().reject_kyc(  # type: ignore
            FakeInfo(), document_id=str(uuid.uuid4()), reason="probe"
        )
