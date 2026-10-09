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
