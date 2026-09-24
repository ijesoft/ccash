"""Inactive accounts must get a distinct error, not 'Invalid credentials'.

After signup a user is PENDING until email/OTP verification activates them.
Login attempts before activation (or after suspension) should say the account
is inactive and to contact an administrator.
"""

import uuid

import pytest

from app.core.errors import AuthenticationError
from app.core.security import hash_password
from app.domains.auth.models import User, UserRole, UserStatus
from app.domains.auth.service import AuthService
from app.domains.wallets.models import Wallet

PASSWORD = "Test123!"
EXPECTED = "Account is inactive, please contact administrator."


async def _make_user(session, status: UserStatus) -> User:
    n = uuid.uuid4().hex[:10]
    user = User(
        email=f"inactive-{n}@ccash.test",
        phone=f"0919{n[:7]}",
        password_hash=hash_password(PASSWORD),
        status=status,
        is_verified=(status == UserStatus.ACTIVE),
        id_no="777777777",
        role=UserRole.MEMBER,
    )
    session.add(user)
    await session.flush()
    session.add(Wallet(user_id=user.id, balance_cents=0))
    await session.commit()
    return user


def _service(session, redis) -> AuthService:
    return AuthService(session, redis)


async def test_login_pending_user_gets_inactive_message(session, redis):
    user = await _make_user(session, UserStatus.PENDING)
    service = _service(session, redis)

    with pytest.raises(AuthenticationError) as exc_info:
        await service.login(user.email, PASSWORD)

    assert str(exc_info.value) == EXPECTED


async def test_login_suspended_user_gets_inactive_message(session, redis):
    user = await _make_user(session, UserStatus.SUSPENDED)
    service = _service(session, redis)

    with pytest.raises(AuthenticationError) as exc_info:
        await service.login(user.email, PASSWORD)

    assert str(exc_info.value) == EXPECTED


async def test_login_inactive_with_wrong_password_still_gets_inactive_message(session, redis):
    """Inactive status takes precedence over password mismatch so users see
    the actionable message instead of a misleading 'Invalid credentials'."""
    user = await _make_user(session, UserStatus.PENDING)
    service = _service(session, redis)

    with pytest.raises(AuthenticationError) as exc_info:
        await service.login(user.email, "WrongPass123!")

    assert str(exc_info.value) == EXPECTED


async def test_complete_login_inactive_gets_inactive_message(session, redis):
    user = await _make_user(session, UserStatus.PENDING)
    service = _service(session, redis)

    with pytest.raises(AuthenticationError) as exc_info:
        await service.complete_login(user.email, "777777777")

    assert str(exc_info.value) == EXPECTED
