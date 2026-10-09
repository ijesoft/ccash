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
