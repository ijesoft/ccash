from app.core.rbac import Permission, has_permission
from app.domains.auth.models import UserRole


def test_auditor_role_exists():
    assert UserRole.AUDITOR.value == "AUDITOR"


def test_auditor_has_read_permissions():
    for perm in (
        Permission.PLATFORM_STATS,
        Permission.USERS_READ,
        Permission.MERCHANTS_READ,
        Permission.TX_READ_ALL,
        Permission.AUDIT_READ,
    ):
        assert has_permission(UserRole.AUDITOR, perm)


def test_auditor_has_no_write_permissions():
    for perm in (
        Permission.USERS_CREATE,
        Permission.USERS_UPDATE,
        Permission.USERS_SUSPEND,
        Permission.USERS_DELETE,
        Permission.USERS_RESET_PASSWORD,
        Permission.USERS_CHANGE_ROLE,
        Permission.CASH_OPERATE,
        Permission.KYC_REVIEW,
    ):
        assert not has_permission(UserRole.AUDITOR, perm)
