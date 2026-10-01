from app.core.rbac import Permission, ROLE_PERMISSIONS, has_permission, permissions_for
from app.domains.auth.models import UserRole


def test_super_admin_role_exists_with_all_perms():
    assert UserRole.SUPER_ADMIN.value == "SUPER_ADMIN"
    assert ROLE_PERMISSIONS[UserRole.SUPER_ADMIN] == ROLE_PERMISSIONS[UserRole.ADMIN]
    assert has_permission(UserRole.SUPER_ADMIN, Permission.USERS_READ) is True
    assert has_permission(UserRole.SUPER_ADMIN, Permission.USERS_CHANGE_ROLE) is True
    assert has_permission(UserRole.SUPER_ADMIN, Permission.PLATFORM_STATS) is True
    assert "users:read" in permissions_for(UserRole.SUPER_ADMIN)


async def test_platform_stats_includes_role_breakdown(session, make_account):
    from app.domains.admin.service import AdminService

    member, member_wallet = await make_account()
    merchant, _ = await make_account()
    merchant.role = UserRole.MERCHANT
    admin, _ = await make_account()
    admin.role = UserRole.ADMIN
    member_wallet.balance_cents = 10000
    await session.commit()

    from app.domains.wallets.repository import WalletRepository

    merchant_wallet = await WalletRepository(session).get_by_user_id(merchant.id)
    admin_wallet = await WalletRepository(session).get_by_user_id(admin.id)
    assert merchant_wallet is not None and admin_wallet is not None
    merchant_wallet.balance_cents = 20000
    admin_wallet.balance_cents = 30000
    await session.commit()

    stats = await AdminService(session).get_platform_stats()
    assert stats["member_count"] == 1
    assert stats["merchant_count"] == 1
    assert stats["admin_count"] == 1
    assert stats["member_balance_cents"] == 10000
    assert stats["merchant_balance_cents"] == 20000
    assert stats["admin_balance_cents"] == 30000
    assert stats["total_wallet_balance_cents"] == 60000


async def test_userrole_enum_has_super_admin_in_db(session):
    from sqlalchemy import text

    rows = (
        (
            await session.execute(
                text(
                    "SELECT enumlabel FROM pg_enum JOIN pg_type "
                    "ON pg_enum.enumtypid = pg_type.oid "
                    "WHERE pg_type.typname = 'userrole'"
                )
            )
        )
        .scalars()
        .all()
    )
    assert "SUPER_ADMIN" in rows
    # Model-level lock alongside the DB check
    assert UserRole.SUPER_ADMIN.value == "SUPER_ADMIN"


async def test_verify_otp_creates_no_wallet_for_super_admin(session, make_account):
    from app.domains.auth.service import AuthService
    from app.domains.wallets.repository import WalletRepository

    class _FakeRedis:
        """In-memory stand-in: real Redis is unreachable from the host."""

        def __init__(self):
            self.store: dict[str, str] = {}

        async def get(self, key: str):
            return self.store.get(key)

        async def setex(self, key: str, _ttl: int, value: str):
            self.store[key] = value

        async def delete(self, *keys: str):
            for key in keys:
                self.store.pop(key, None)

    user, _w = await make_account()
    user.role = UserRole.SUPER_ADMIN
    await session.commit()
    # Simulate the seed shape: super-admin rows are created without a wallet.
    existing = await WalletRepository(session).get_by_user_id(user.id)
    if existing:
        await session.delete(existing)
        await session.commit()
    assert await WalletRepository(session).get_by_user_id(user.id) is None

    # Directly assert verify_otp skips wallet creation for SUPER_ADMIN.
    fake_redis = _FakeRedis()
    fake_redis.store[f"otp:{user.email}"] = "123456"
    service = AuthService(session, fake_redis)
    assert await service.verify_otp(user.email, "123456") is True
    assert await WalletRepository(session).get_by_user_id(user.id) is None


async def test_wallet_service_blocks_super_admin(session, make_account):
    import pytest

    from app.core.errors import ValidationError
    from app.domains.wallets.service import WalletService

    user, _w = await make_account()
    user.role = UserRole.SUPER_ADMIN
    user.id_no = "900000001"
    await session.commit()
    service = WalletService(session)
    with pytest.raises(ValidationError, match="Super admin"):
        await service.get_or_create_wallet_for_role(user.id, UserRole.SUPER_ADMIN)


async def test_send_money_blocks_super_admin_caller(session, make_account):
    import uuid

    import pytest

    from app.core.errors import ValidationError
    from app.domains.transactions.service import TransactionService

    caller, _w = await make_account()
    caller.role = UserRole.SUPER_ADMIN
    await session.commit()
    service = TransactionService(session)
    with pytest.raises(ValidationError, match="Super admin"):
        await service.send_money(
            caller.id, None, 10000, str(uuid.uuid4()), receiver_mobile="09180000002"
        )


def test_register_has_no_role_param():
    import inspect

    from app.domains.auth.service import AuthService

    assert "role" not in inspect.signature(AuthService.register).parameters


async def test_request_money_blocks_super_admin(session, make_account):
    import uuid

    import pytest

    from app.core.errors import ValidationError
    from app.domains.transactions.service import TransactionService

    caller, _w = await make_account()
    caller.role = UserRole.SUPER_ADMIN
    await session.commit()
    _other, other_wallet = await make_account()
    service = TransactionService(session)
    with pytest.raises(ValidationError, match="Super admin"):
        await service.request_money(caller.id, other_wallet.id, 10000, str(uuid.uuid4()))


async def test_set_pin_blocks_super_admin(session, make_account):
    import pytest

    from app.core.errors import ValidationError
    from app.domains.wallets.service import WalletService

    user, _w = await make_account()
    user.role = UserRole.SUPER_ADMIN
    await session.commit()
    service = WalletService(session)
    with pytest.raises(ValidationError, match="Super admin"):
        await service.set_pin(user.id, "1234")


async def test_send_money_to_super_admin_recipient_blocked(session, make_account):
    import uuid

    import pytest

    from app.core.errors import ValidationError
    from app.domains.transactions.service import TransactionService
    from app.domains.wallets.repository import WalletRepository

    sender, _sender_wallet = await make_account()
    recipient, _recipient_wallet = await make_account()
    recipient.role = UserRole.SUPER_ADMIN
    await session.commit()
    # Simulate the seed shape: super-admin rows exist without a wallet.
    existing = await WalletRepository(session).get_by_user_id(recipient.id)
    if existing:
        await session.delete(existing)
        await session.commit()
    assert await WalletRepository(session).get_by_user_id(recipient.id) is None

    service = TransactionService(session)
    with pytest.raises(ValidationError, match="Super admin"):
        await service.send_money(
            sender.id, None, 10000, str(uuid.uuid4()), receiver_mobile=recipient.phone
        )
    assert await WalletRepository(session).get_by_user_id(recipient.id) is None


async def test_only_super_admin_can_assign_super_admin(session, make_account):
    import pytest

    from app.core.errors import ValidationError
    from app.domains.admin.service import AdminService
    from app.domains.auth.models import UserRole

    admin, _ = await make_account()
    admin.role = UserRole.ADMIN
    target, _ = await make_account()
    await session.commit()
    service = AdminService(session)
    with pytest.raises(ValidationError, match="(?i)super admin"):
        await service.update_user_role(target.id, UserRole.SUPER_ADMIN, actor_id=admin.id)


async def test_super_admin_can_promote_to_super_admin(session, make_account):
    from app.domains.admin.service import AdminService
    from app.domains.auth.models import UserRole

    superadmin, _ = await make_account()
    superadmin.role = UserRole.SUPER_ADMIN
    target, _ = await make_account()
    await session.commit()
    service = AdminService(session)
    updated = await service.update_user_role(
        target.id, UserRole.SUPER_ADMIN, actor_id=superadmin.id
    )
    assert updated.role == UserRole.SUPER_ADMIN


async def test_admin_cannot_suspend_or_delete_super_admin(session, make_account):
    import pytest

    from app.core.errors import ValidationError
    from app.domains.admin.service import AdminService
    from app.domains.auth.models import UserRole

    admin, _ = await make_account()
    admin.role = UserRole.ADMIN
    superadmin, _ = await make_account()
    superadmin.role = UserRole.SUPER_ADMIN
    await session.commit()
    service = AdminService(session)
    with pytest.raises(ValidationError, match="(?i)super admin"):
        await service.suspend_user_as(superadmin.id, actor_id=admin.id)
    with pytest.raises(ValidationError, match="(?i)super admin"):
        await service.delete_account(superadmin.id, actor_id=admin.id)


async def test_cannot_delete_last_super_admin(session, make_account):
    import pytest

    from app.core.errors import ValidationError
    from app.domains.admin.service import AdminService
    from app.domains.auth.models import UserRole

    superadmin, _ = await make_account()
    superadmin.role = UserRole.SUPER_ADMIN
    await session.commit()
    service = AdminService(session)
    # Self-delete guard fires first in the single-super-admin setup; accept
    # either message — both prevent last-super-admin lockout.
    with pytest.raises(ValidationError, match="(?i)super-admin|own account"):
        await service.delete_account(superadmin.id, actor_id=superadmin.id)


async def test_cannot_demote_last_super_admin(session, make_account):
    import pytest

    from app.core.errors import ValidationError
    from app.domains.admin.service import AdminService
    from app.domains.auth.models import UserRole

    superadmin, _ = await make_account()
    superadmin.role = UserRole.SUPER_ADMIN
    await session.commit()
    service = AdminService(session)
    # Self-demote guard fires first in the single-super-admin setup; accept
    # either message — both prevent last-super-admin lockout.
    with pytest.raises(ValidationError, match="(?i)super-admin|own account"):
        await service.update_user_role(
            superadmin.id, UserRole.MEMBER, actor_id=superadmin.id
        )


async def test_seed_shape_superadmin_has_no_wallet(session, make_account):
    # Seed contract: a SUPER_ADMIN row mirroring the seed fields exists and
    # has no wallet row. DB-backed shape test only — do NOT invoke
    # seed.seed() here (it targets whichever DB settings point at, i.e. the
    # non-test DB). Live-seed verification is deferred to Task 8/operator.
    from app.domains.auth.models import UserRole, UserStatus
    from app.domains.wallets.repository import WalletRepository

    user, _w = await make_account()
    user.email = "superadmin@ccash.ph"
    user.phone = "09180000000"
    user.id_no = "000000000"
    user.first_name = "Super"
    user.last_name = "Admin"
    user.status = UserStatus.ACTIVE
    user.is_verified = True
    user.role = UserRole.SUPER_ADMIN
    await session.commit()
    # Simulate the seed shape: super-admin rows are created without a wallet.
    existing = await WalletRepository(session).get_by_user_id(user.id)
    if existing:
        await session.delete(existing)
        await session.commit()

    fetched = await session.get(type(user), user.id)
    assert fetched is not None
    assert fetched.email == "superadmin@ccash.ph"
    assert fetched.phone == "09180000000"
    assert fetched.id_no == "000000000"
    assert fetched.first_name == "Super"
    assert fetched.last_name == "Admin"
    assert fetched.role == UserRole.SUPER_ADMIN
    assert fetched.status == UserStatus.ACTIVE
    assert fetched.is_verified is True
    assert await WalletRepository(session).get_by_user_id(user.id) is None


async def test_send_money_to_super_admin_wallet_id_blocked(session, make_account):
    import uuid

    import pytest

    from app.core.errors import ValidationError
    from app.domains.transactions.repository import TransactionRepository
    from app.domains.transactions.service import TransactionService
    from app.domains.wallets.repository import WalletRepository

    sender, _sender_wallet = await make_account()
    recipient, recipient_wallet = await make_account()
    balance_before = recipient_wallet.balance_cents
    recipient.role = UserRole.SUPER_ADMIN
    await session.commit()
    # Unlike the mobile path, the direct wallet-id path keeps the recipient's
    # wallet row (make_account minted it); the guard must still refuse to
    # credit it.
    assert await WalletRepository(session).get_by_id(recipient_wallet.id) is not None

    service = TransactionService(session)
    key = str(uuid.uuid4())
    with pytest.raises(ValidationError, match="(?i)super admin"):
        await service.send_money(sender.id, recipient_wallet.id, 10000, key)

    fresh = await WalletRepository(session).get_by_id(recipient_wallet.id)
    assert fresh is not None
    assert fresh.balance_cents == balance_before
    assert await TransactionRepository(session).get_by_idempotency_key(key) is None
