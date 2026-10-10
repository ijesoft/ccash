def test_recovery_status_values():
    from app.domains.auth.password_recovery import RecoveryStatus
    assert {s.value for s in RecoveryStatus} == {"pending", "cancelled", "approved", "processed"}


def test_generate_recovery_code_shape():
    from app.core.security import generate_recovery_code
    import re
    code = generate_recovery_code()
    assert re.fullmatch(r"[A-Za-z0-9]{8}", code)
    assert generate_recovery_code() != code  # randomness spot-check


def test_recover_password_permission_exists():
    from app.core.rbac import Permission, has_permission
    from app.domains.auth.models import UserRole
    assert Permission.USERS_RECOVER_PASSWORD.value == "users:recover-password"
    assert has_permission(UserRole.ADMIN, Permission.USERS_RECOVER_PASSWORD)
    assert has_permission(UserRole.SUPER_ADMIN, Permission.USERS_RECOVER_PASSWORD)
    assert not has_permission(UserRole.AUDITOR, Permission.USERS_RECOVER_PASSWORD)
    assert not has_permission(UserRole.MEMBER, Permission.USERS_RECOVER_PASSWORD)


async def test_submit_request_creates_pending_and_cancels_prior(session, make_account):
    from app.domains.auth.password_recovery import PasswordResetRequest, RecoveryService
    user, _ = await make_account()
    svc = RecoveryService(session)
    first = await svc.submit_request(user.email)
    assert first.status == "pending"
    second = await svc.submit_request(user.email)
    assert second.status == "pending"
    # prior row flipped to cancelled
    row = await session.get(PasswordResetRequest, first.id)
    assert row is not None
    assert row.status == "cancelled"


async def test_submit_unknown_email_raises(session):
    from app.core.errors import ValidationError
    from app.domains.auth.password_recovery import RecoveryService
    import pytest
    with pytest.raises(ValidationError, match="Account not found"):
        await RecoveryService(session).submit_request("nobody@ccash.ph")


async def test_consume_rejects_bad_code(session, make_account):
    from app.core.errors import ValidationError
    from app.domains.auth.password_recovery import RecoveryService
    import pytest
    user, _ = await make_account()
    svc = RecoveryService(session)
    await svc.submit_request(user.email)
    with pytest.raises(ValidationError, match="Invalid or expired"):
        await svc.consume_code("WRONGCODE", "NewPass123")


async def test_approve_assigns_code_once(session, make_account):
    import pytest
    from datetime import datetime, timezone
    from app.core.errors import ValidationError
    from app.core.security import verify_password
    from app.domains.admin.service import AdminService
    from app.domains.auth.password_recovery import (
        PasswordResetRequest,
        RecoveryService,
    )

    user, _ = await make_account()
    admin, _ = await make_account()
    req = await RecoveryService(session).submit_request(user.email)

    row, code = await AdminService(session).approve_recovery_request(req.id, admin.id)
    assert row["status"] == "approved"
    stored = await session.get(PasswordResetRequest, req.id)
    assert stored is not None
    assert stored.status == "approved"
    assert stored.code_hash is not None
    assert verify_password(code, stored.code_hash) is True
    assert stored.expires_at is not None
    delta = (stored.expires_at - datetime.now(timezone.utc)).total_seconds()
    assert 30 * 60 < delta <= 60 * 60 + 60

    with pytest.raises(ValidationError, match="Only pending"):
        await AdminService(session).approve_recovery_request(req.id, admin.id)


async def test_cancel_flips_status(session, make_account):
    import pytest
    from app.core.errors import ValidationError
    from app.domains.admin.service import AdminService
    from app.domains.auth.password_recovery import (
        PasswordResetRequest,
        RecoveryService,
    )

    user, _ = await make_account()
    admin, _ = await make_account()
    svc = RecoveryService(session)
    pending = await svc.submit_request(user.email)
    result = await AdminService(session).cancel_recovery_request(pending.id, admin.id)
    assert result["status"] == "cancelled"
    stored = await session.get(PasswordResetRequest, pending.id)
    assert stored is not None
    assert stored.status == "cancelled"

    # Approved rows can also be cancelled; the issued code then stops working.
    second = await svc.submit_request(user.email)
    _, code = await AdminService(session).approve_recovery_request(second.id, admin.id)
    await AdminService(session).cancel_recovery_request(second.id, admin.id)
    with pytest.raises(ValidationError, match="Invalid or expired"):
        await svc.consume_code(code, "NewPass123")


async def test_consume_marks_processed_and_reuse_rejected(session, make_account):
    import pytest
    from app.core.errors import ValidationError
    from app.core.security import verify_password
    from app.domains.admin.service import AdminService
    from app.domains.auth.models import User
    from app.domains.auth.password_recovery import (
        PasswordResetRequest,
        RecoveryService,
    )

    user, _ = await make_account()
    admin, _ = await make_account()
    user_id = user.id
    svc = RecoveryService(session)
    req = await svc.submit_request(user.email)
    _, code = await AdminService(session).approve_recovery_request(req.id, admin.id)

    await svc.consume_code(code, "NewPass123")
    stored = await session.get(PasswordResetRequest, req.id)
    assert stored is not None
    assert stored.status == "processed"
    fresh = await session.get(User, user_id)
    assert fresh is not None
    assert verify_password("NewPass123", fresh.password_hash) is True

    with pytest.raises(ValidationError, match="Invalid or expired"):
        await svc.consume_code(code, "OtherPass123")


async def test_non_admin_cannot_approve(session, make_account, monkeypatch):
    import uuid

    import pytest

    import app.domains.admin.graphql as admin_gql
    from app.domains.admin.service import AdminService
    from app.domains.auth.models import UserRole
    from app.domains.auth.password_recovery import RecoveryService
    from app.graphql.middleware import AuthContext

    user, _ = await make_account()
    req = await RecoveryService(session).submit_request(user.email)

    async def fake_get_admin_service(info):
        return AdminService(session)

    monkeypatch.setattr(admin_gql, "get_admin_service", fake_get_admin_service)

    class FakeInfo:
        context = AuthContext()

    FakeInfo.context.user_id = uuid.uuid4()
    FakeInfo.context.role = UserRole.MEMBER.value
    FakeInfo.context.scopes = ["wallet:read", "wallet:write"]

    with pytest.raises(Exception, match="Not authorized"):
        await admin_gql.AdminMutations().approve_password_recovery_request(  # type: ignore
            FakeInfo(), str(req.id)
        )
