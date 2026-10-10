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
