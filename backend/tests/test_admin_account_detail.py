"""Admin account detail page: view, update, and soft-delete a Member/Merchant
profile. Real Postgres (session fixture), service layer exercised directly,
matching test_rbac.py's convention.
"""

import uuid

import pytest

from app.core.errors import NotFoundError, ValidationError
from app.core.security import hash_password
from app.domains.admin.service import AdminService
from app.domains.auth.models import User, UserRole, UserStatus
from app.domains.auth.repository import UserRepository
from app.domains.merchants.models import MerchantProfile
from app.domains.wallets.models import Wallet
from app.domains.wallets.repository import WalletRepository


async def _make_user(session, id_no: str | None = None, role: UserRole = UserRole.MEMBER, balance_cents: int = 0) -> User:
    n = uuid.uuid4().hex[:10]
    user = User(
        email=f"detail-{n}@ccash.test",
        phone=f"0917{n[:7]}",
        password_hash=hash_password("Original123!"),
        first_name="Original",
        last_name="Name",
        status=UserStatus.ACTIVE,
        is_verified=True,
        id_no=id_no,
        role=role,
    )
    session.add(user)
    await session.flush()
    session.add(Wallet(user_id=user.id, balance_cents=balance_cents))
    await session.commit()
    return user


async def _make_merchant(session, merchant_id_no: str, balance_cents: int = 0) -> tuple[User, MerchantProfile]:
    user = await _make_user(session, id_no=None, role=UserRole.MERCHANT, balance_cents=balance_cents)
    profile = MerchantProfile(
        user_id=user.id,
        merchant_id_no=merchant_id_no,
        company_name="Original Store",
        contact_person="Original Owner",
        mobile_no=user.phone,
        address="Original Address",
        tin="000-000-000",
    )
    session.add(profile)
    await session.commit()
    return user, profile


# --------------------------------------------------------------------- view


async def test_get_account_detail_for_member(session):
    user = await _make_user(session, id_no="600000001", balance_cents=12345)
    service = AdminService(session)

    detail = await service.get_account_detail(user.id)

    assert detail["email"] == user.email
    assert detail["id_no"] == "600000001"
    assert detail["wallet_balance_cents"] == 12345
    assert detail["merchant"] is None


async def test_get_account_detail_for_merchant_includes_profile(session):
    user, profile = await _make_merchant(session, "M600000002")
    service = AdminService(session)

    detail = await service.get_account_detail(user.id)

    assert detail["merchant"]["merchant_id_no"] == "M600000002"
    assert detail["merchant"]["company_name"] == "Original Store"


async def test_get_account_detail_unknown_raises(session):
    service = AdminService(session)
    with pytest.raises(NotFoundError):
        await service.get_account_detail(uuid.uuid4())


# ------------------------------------------------------------------- update


async def test_update_member_profile_changes_fields(session):
    user = await _make_user(session, id_no="600000003")
    service = AdminService(session)

    updated = await service.update_member_profile(
        user.id,
        first_name="Updated",
        last_name="Person",
        email="updated-member@ccash.test",
        phone="09171112222",
        middle_name="Middle",
    )

    assert updated.first_name == "Updated"
    assert updated.last_name == "Person"
    assert updated.middle_name == "Middle"
    assert updated.email == "updated-member@ccash.test"
    assert updated.phone == "09171112222"


async def test_update_member_profile_rejects_duplicate_email(session):
    await _make_user(session, id_no="600000004")
    taken_email = (await _make_user(session, id_no="600000005")).email
    target = await _make_user(session, id_no="600000006")
    service = AdminService(session)

    with pytest.raises(ValidationError):
        await service.update_member_profile(
            target.id, first_name="A", last_name="B", email=taken_email, phone="09171112223"
        )


async def test_update_member_profile_rejects_merchant_account(session):
    user, _profile = await _make_merchant(session, "M600000007")
    service = AdminService(session)

    with pytest.raises(ValidationError):
        await service.update_member_profile(
            user.id, first_name="A", last_name="B", email="x@ccash.test", phone="09171112224"
        )


async def test_update_merchant_profile_changes_fields(session):
    user, _profile = await _make_merchant(session, "M600000008")
    service = AdminService(session)

    updated_user, updated_profile = await service.update_merchant_profile(
        user.id,
        company_name="New Store Name",
        contact_person="New Contact",
        mobile_no="09171112225",
        address="New Address",
        tin="111-222-333",
        email="updated-merchant@ccash.test",
        landline="028001234",
    )

    assert updated_profile.company_name == "New Store Name"
    assert updated_profile.contact_person == "New Contact"
    assert updated_profile.landline == "028001234"
    assert updated_user.email == "updated-merchant@ccash.test"
    assert updated_user.phone == "09171112225"
    assert updated_profile.mobile_no == "09171112225"


async def test_update_merchant_profile_rejects_missing_fields(session):
    user, _profile = await _make_merchant(session, "M600000009")
    service = AdminService(session)

    with pytest.raises(ValidationError):
        await service.update_merchant_profile(
            user.id,
            company_name="",
            contact_person="X",
            mobile_no="09171112226",
            address="Addr",
            tin="TIN",
            email="x@ccash.test",
        )


# ------------------------------------------------------------------- delete


async def test_delete_account_soft_deletes_user_and_wallet(session):
    user = await _make_user(session, id_no="600000010", balance_cents=0)
    actor_id = uuid.uuid4()
    service = AdminService(session)

    await service.delete_account(user.id, actor_id)

    assert await UserRepository(session).get_by_id(user.id) is None
    assert await WalletRepository(session).get_by_user_id(user.id) is None


async def test_delete_account_blocks_nonzero_balance(session):
    user = await _make_user(session, id_no="600000011", balance_cents=500)
    service = AdminService(session)

    with pytest.raises(ValidationError):
        await service.delete_account(user.id, uuid.uuid4())


async def test_delete_account_blocks_self_delete(session):
    user = await _make_user(session, id_no="600000012")
    service = AdminService(session)

    with pytest.raises(ValidationError):
        await service.delete_account(user.id, user.id)


async def test_delete_account_blocks_last_admin(session):
    admin = await _make_user(session, id_no="600000013", role=UserRole.ADMIN)
    service = AdminService(session)

    with pytest.raises(ValidationError):
        await service.delete_account(admin.id, uuid.uuid4())


async def test_delete_account_allows_admin_when_another_admin_exists(session):
    admin1 = await _make_user(session, id_no="600000014", role=UserRole.ADMIN)
    admin2 = await _make_user(session, id_no="600000015", role=UserRole.ADMIN)
    service = AdminService(session)

    await service.delete_account(admin1.id, admin2.id)

    assert await UserRepository(session).get_by_id(admin1.id) is None


async def test_deleted_account_cannot_be_found_by_email(session):
    user = await _make_user(session, id_no="600000016")
    email = user.email
    service = AdminService(session)

    await service.delete_account(user.id, uuid.uuid4())

    assert await UserRepository(session).get_by_email(email) is None


async def test_delete_merchant_soft_deletes_profile(session):
    user, profile = await _make_merchant(session, "M600000017")
    service = AdminService(session)

    await service.delete_account(user.id, uuid.uuid4())

    from app.domains.merchants.repository import MerchantRepository

    assert await MerchantRepository(session).get_by_user_id(user.id) is None
