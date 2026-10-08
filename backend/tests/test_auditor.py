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
