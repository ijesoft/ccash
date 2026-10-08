"""Change-password tests: verify current, hash new, enforce min length."""

import uuid

import pytest

from app.core.errors import AuthenticationError, NotFoundError, ValidationError
from app.core.security import hash_password, verify_password
from app.domains.auth.models import User, UserStatus
from app.domains.auth.service import AuthService
from app.domains.wallets.models import Wallet

OLD_PASSWORD = "OldPass123"
NEW_PASSWORD = "NewPass456"


async def _make_user(session) -> User:
    n = uuid.uuid4().hex[:10]
    user = User(
        email=f"changepw-{n}@ccash.test",
        phone=f"0919{n[:7]}",
        password_hash=hash_password(OLD_PASSWORD),
        status=UserStatus.ACTIVE,
        is_verified=True,
    )
    session.add(user)
    await session.flush()
    session.add(Wallet(user_id=user.id, balance_cents=0))
    await session.commit()
    return user


async def test_change_password_succeeds_with_correct_current(session, redis):
    user = await _make_user(session)
    service = AuthService(session, redis)

    result = await service.change_password(user.id, OLD_PASSWORD, NEW_PASSWORD)

    assert result is True
    await session.refresh(user)
    assert verify_password(NEW_PASSWORD, user.password_hash) is True
    assert verify_password(OLD_PASSWORD, user.password_hash) is False


async def test_change_password_rejects_wrong_current(session, redis):
    user = await _make_user(session)
    service = AuthService(session, redis)

    with pytest.raises(AuthenticationError):
        await service.change_password(user.id, "WrongPass999", NEW_PASSWORD)

    await session.refresh(user)
    assert verify_password(OLD_PASSWORD, user.password_hash) is True


async def test_change_password_rejects_short_new_password(session, redis):
    user = await _make_user(session)
    service = AuthService(session, redis)

    with pytest.raises(ValidationError):
        await service.change_password(user.id, OLD_PASSWORD, "short")

    await session.refresh(user)
    assert verify_password(OLD_PASSWORD, user.password_hash) is True


async def test_change_password_rejects_unknown_user(session, redis):
    service = AuthService(session, redis)

    with pytest.raises(NotFoundError):
        await service.change_password(uuid.uuid4(), OLD_PASSWORD, NEW_PASSWORD)
