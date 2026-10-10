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
