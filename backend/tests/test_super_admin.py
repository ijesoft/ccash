from app.core.rbac import Permission, ROLE_PERMISSIONS, has_permission, permissions_for
from app.domains.auth.models import UserRole


def test_super_admin_role_exists_with_all_perms():
    assert UserRole.SUPER_ADMIN.value == "SUPER_ADMIN"
    assert ROLE_PERMISSIONS[UserRole.SUPER_ADMIN] == ROLE_PERMISSIONS[UserRole.ADMIN]
    assert has_permission(UserRole.SUPER_ADMIN, Permission.USERS_READ) is True
    assert has_permission(UserRole.SUPER_ADMIN, Permission.USERS_CHANGE_ROLE) is True
    assert has_permission(UserRole.SUPER_ADMIN, Permission.PLATFORM_STATS) is True
    assert "users:read" in permissions_for(UserRole.SUPER_ADMIN)


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
