"""Admin panel: assign/reassign a Member's ID No. or a Merchant's Merchant ID,
and reset a password. Real Postgres (session fixture), service layer exercised
directly, no HTTP or Redis — matches test_rbac.py's convention. reset_password
queues an email via Celery .delay(), same as create_member elsewhere; the
real broker on this dev host accepts the publish even with no consumer.
"""

import uuid

import pytest

from app.core.errors import NotFoundError, ValidationError
from app.core.security import hash_password, verify_password
from app.domains.admin.service import AdminService
from app.domains.auth.models import User, UserRole, UserStatus
from app.domains.merchants.models import MerchantProfile


async def _make_user(session, id_no: str | None = None, role: UserRole = UserRole.MEMBER) -> User:
    n = uuid.uuid4().hex[:10]
    user = User(
        email=f"admin-id-{n}@ccash.test",
        phone=f"0919{n[:7]}",
        password_hash=hash_password("Original123!"),
        status=UserStatus.ACTIVE,
        is_verified=True,
        id_no=id_no,
        role=role,
    )
    session.add(user)
    await session.flush()
    await session.commit()
    return user


async def _make_merchant(session, merchant_id_no: str | None) -> tuple[User, MerchantProfile]:
    user = await _make_user(session, id_no=None, role=UserRole.MERCHANT)
    profile = MerchantProfile(
        user_id=user.id,
        merchant_id_no=merchant_id_no or f"M{uuid.uuid4().hex[:9]}",
        company_name="Test Store",
        contact_person="Owner",
        mobile_no=user.phone,
        address="Somewhere",
        tin="000-000-000",
    )
    session.add(profile)
    await session.commit()
    return user, profile


# ------------------------------------------------------------- member ID


async def test_admin_set_member_id_assigns_when_missing(session):
    user = await _make_user(session, id_no=None)
    service = AdminService(session)

    updated = await service.set_member_id(user.id, "700000001")
    assert updated.id_no == "700000001"


async def test_admin_set_member_id_overwrites_existing(session):
    user = await _make_user(session, id_no="700000002")
    service = AdminService(session)

    updated = await service.set_member_id(user.id, "700000003")
    assert updated.id_no == "700000003"


async def test_admin_set_member_id_rejects_malformed(session):
    user = await _make_user(session, id_no=None)
    service = AdminService(session)

    with pytest.raises(ValidationError):
        await service.set_member_id(user.id, "abc")


async def test_admin_set_member_id_rejects_duplicate(session):
    await _make_user(session, id_no="700000004")
    other = await _make_user(session, id_no=None)
    service = AdminService(session)

    with pytest.raises(ValidationError):
        await service.set_member_id(other.id, "700000004")


async def test_admin_set_member_id_rejects_merchant_account(session):
    merchant_user, _profile = await _make_merchant(session, "M700000005")
    service = AdminService(session)

    with pytest.raises(ValidationError):
        await service.set_member_id(merchant_user.id, "700000006")


async def test_admin_set_member_id_unknown_account_raises(session):
    service = AdminService(session)
    with pytest.raises(NotFoundError):
        await service.set_member_id(uuid.uuid4(), "700000007")


# ----------------------------------------------------------- merchant ID


async def test_admin_set_merchant_id_assigns(session):
    user, _profile = await _make_merchant(session, "M700000008")
    service = AdminService(session)

    updated = await service.set_merchant_id(user.id, "M700000009")
    assert updated.merchant_id_no == "M700000009"


async def test_admin_set_merchant_id_rejects_malformed(session):
    user, _profile = await _make_merchant(session, "M700000010")
    service = AdminService(session)

    with pytest.raises(ValidationError):
        await service.set_merchant_id(user.id, "700000011")  # missing "M"


async def test_admin_set_merchant_id_rejects_duplicate(session):
    _u1, _p1 = await _make_merchant(session, "M700000012")
    u2, _p2 = await _make_merchant(session, "M700000013")
    service = AdminService(session)

    with pytest.raises(ValidationError):
        await service.set_merchant_id(u2.id, "M700000012")


async def test_admin_set_merchant_id_rejects_non_merchant_account(session):
    user = await _make_user(session, id_no="700000014")
    service = AdminService(session)

    with pytest.raises(NotFoundError):
        await service.set_merchant_id(user.id, "M700000015")


# ------------------------------------------------------------ password reset


async def test_admin_reset_password_changes_hash_and_invalidates_old(session):
    user = await _make_user(session, id_no="700000016")
    service = AdminService(session)

    updated, temp_password = await service.reset_password(user.id)

    assert verify_password(temp_password, updated.password_hash)
    assert not verify_password("Original123!", updated.password_hash)


async def test_admin_reset_password_unknown_account_raises(session):
    service = AdminService(session)
    with pytest.raises(NotFoundError):
        await service.reset_password(uuid.uuid4())


async def test_admin_reset_password_does_not_touch_id_no(session):
    user = await _make_user(session, id_no="700000017")
    service = AdminService(session)

    updated, _temp_password = await service.reset_password(user.id)
    assert updated.id_no == "700000017"
