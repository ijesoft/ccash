"""Login is now two steps: password (+2FA) via login(), then ID No. via
complete_login() before tokens are issued. Real Postgres (session fixture)
and real Redis (the pending-login marker lives there; see the `redis` fixture
in conftest.py), matching this repo's existing integration-style testing
convention. Unique emails per test avoid collisions on the shared Redis
instance.
"""

import uuid

import pytest

from app.core.errors import AuthenticationError, ValidationError
from app.core.security import hash_password
from app.domains.auth.models import User, UserRole, UserStatus
from app.domains.auth.service import AuthService
from app.domains.merchants.models import MerchantProfile
from app.domains.wallets.models import Wallet

PASSWORD = "Test123!"


async def _make_user(session, id_no: str | None, role: UserRole = UserRole.MEMBER) -> User:
    n = uuid.uuid4().hex[:10]
    user = User(
        email=f"login-{n}@ccash.test",
        phone=f"0918{n[:7]}",
        password_hash=hash_password(PASSWORD),
        status=UserStatus.ACTIVE,
        is_verified=True,
        id_no=id_no,
        role=role,
    )
    session.add(user)
    await session.flush()
    session.add(Wallet(user_id=user.id, balance_cents=0))
    await session.commit()
    return user


async def _make_merchant(session, merchant_id_no: str) -> User:
    user = await _make_user(session, id_no=None, role=UserRole.MERCHANT)
    session.add(
        MerchantProfile(
            user_id=user.id,
            merchant_id_no=merchant_id_no,
            company_name="Test Store",
            contact_person="Owner",
            mobile_no=user.phone,
            address="Somewhere",
            tin="000-000-000",
        )
    )
    await session.commit()
    return user


def _service(session, redis) -> AuthService:
    return AuthService(session, redis)


# ------------------------------------------------------------- verify branch


async def test_login_returns_challenge_not_tokens(session, redis):
    user = await _make_user(session, id_no="111111111")
    service = _service(session, redis)

    email, has_existing_id = await service.login(user.email, PASSWORD)

    assert email == user.email
    assert has_existing_id is True


async def test_complete_login_succeeds_with_correct_id(session, redis):
    user = await _make_user(session, id_no="111111112")
    service = _service(session, redis)

    await service.login(user.email, PASSWORD)
    access, refresh, logged_in_user = await service.complete_login(user.email, "111111112")

    assert access
    assert refresh
    assert logged_in_user.id == user.id


async def test_complete_login_rejects_wrong_id(session, redis):
    user = await _make_user(session, id_no="111111113")
    service = _service(session, redis)

    await service.login(user.email, PASSWORD)
    with pytest.raises(AuthenticationError):
        await service.complete_login(user.email, "999999999")


async def test_complete_login_without_prior_login_is_rejected(session, redis):
    user = await _make_user(session, id_no="111111114")
    service = _service(session, redis)

    with pytest.raises(AuthenticationError):
        await service.complete_login(user.email, "111111114")


async def test_complete_login_is_single_use(session, redis):
    """The pending marker is consumed on success; a second attempt (e.g. a
    replayed request) must not silently re-issue tokens."""
    user = await _make_user(session, id_no="111111115")
    service = _service(session, redis)

    await service.login(user.email, PASSWORD)
    await service.complete_login(user.email, "111111115")

    with pytest.raises(AuthenticationError):
        await service.complete_login(user.email, "111111115")


# --------------------------------------------------------- force-set branch


async def test_complete_login_sets_id_when_account_has_none(session, redis):
    user = await _make_user(session, id_no=None)
    service = _service(session, redis)

    email, has_existing_id = await service.login(user.email, PASSWORD)
    assert has_existing_id is False

    access, _refresh, _user = await service.complete_login(email, "222222222")
    assert access

    await session.refresh(user)
    assert user.id_no == "222222222"


async def test_complete_login_set_branch_rejects_malformed_id(session, redis):
    user = await _make_user(session, id_no=None)
    service = _service(session, redis)

    await service.login(user.email, PASSWORD)
    with pytest.raises(ValidationError):
        await service.complete_login(user.email, "12345")


async def test_complete_login_set_branch_rejects_id_taken_by_another_account(session, redis):
    await _make_user(session, id_no="333333333")
    newcomer = await _make_user(session, id_no=None)
    service = _service(session, redis)

    await service.login(newcomer.email, PASSWORD)
    with pytest.raises(ValidationError):
        await service.complete_login(newcomer.email, "333333333")


async def test_id_set_during_complete_login_is_required_on_next_login(session, redis):
    """Once an account sets its ID No., subsequent logins must verify it —
    the account should not be able to change it by simply logging in again."""
    user = await _make_user(session, id_no=None)
    service = _service(session, redis)

    await service.login(user.email, PASSWORD)
    await service.complete_login(user.email, "444444444")

    email, has_existing_id = await service.login(user.email, PASSWORD)
    assert has_existing_id is True

    with pytest.raises(AuthenticationError):
        await service.complete_login(email, "555555555")


# ----------------------------------------------------------------- merchant


async def test_merchant_complete_login_verifies_against_merchant_id_no(session, redis):
    user = await _make_merchant(session, merchant_id_no="M123456789")
    service = _service(session, redis)

    email, has_existing_id = await service.login(user.email, PASSWORD)
    assert has_existing_id is True  # merchants always have one already

    access, _refresh, _user = await service.complete_login(email, "M123456789")
    assert access


async def test_merchant_complete_login_rejects_wrong_merchant_id(session, redis):
    user = await _make_merchant(session, merchant_id_no="M111111111")
    service = _service(session, redis)

    await service.login(user.email, PASSWORD)
    with pytest.raises(AuthenticationError):
        await service.complete_login(user.email, "M999999999")


# ------------------------------------------------------------------- misc


async def test_complete_login_rejects_account_suspended_after_password_step(session, redis):
    user = await _make_user(session, id_no="666666666")
    service = _service(session, redis)

    await service.login(user.email, PASSWORD)
    user.status = UserStatus.SUSPENDED
    await session.commit()

    with pytest.raises(AuthenticationError):
        await service.complete_login(user.email, "666666666")
