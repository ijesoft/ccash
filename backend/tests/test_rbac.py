"""RBAC: role storage, token scopes, admin-only enforcement.

Covers docs/superpowers/specs/2026-08-19-rbac-admin-cash-gating-design.md.
Tests follow the repo convention: real Postgres via the Alembic-migrated
ccash_test database, service layer exercised directly (no HTTP, no Redis).
"""

import uuid

import pytest

from app.core.errors import AuthenticationError
from app.core.security import create_access_token, decode_token
from app.domains.auth.models import User, UserRole


async def promote(session, user) -> None:
    """Flip a fixture user to ADMIN and persist."""
    user.role = UserRole.ADMIN
    await session.commit()


async def test_scopes_for_admin_include_admin(session, make_account):
    from app.domains.auth.service import scopes_for_user

    admin, _wallet = await make_account()
    await promote(session, admin)
    scopes = await scopes_for_user(session, admin)
    assert scopes[:2] == ["wallet:read", "wallet:write"]
    assert "admin" in scopes
    assert "users:read" in scopes
    assert "platform:stats" in scopes


async def test_scopes_for_regular_user_has_no_admin(session, make_account):
    from app.domains.auth.service import scopes_for_user

    user, _wallet = await make_account()
    assert await scopes_for_user(session, user) == ["wallet:read", "wallet:write"]


def test_access_token_roundtrip_preserves_scopes():
    token = create_access_token("u123", scopes=["wallet:read", "wallet:write", "admin"])
    payload = decode_token(token)
    assert payload["scopes"] == ["wallet:read", "wallet:write", "admin"]


async def test_load_user_or_raise_returns_user(session, make_account):
    from app.domains.auth.service import AuthService

    user, _wallet = await make_account()
    service = AuthService(session, None)  # redis unused by this path
    loaded = await service._load_user_or_raise(str(user.id))
    assert loaded.id == user.id


async def test_load_user_or_raise_rejects_unknown_user(session):
    from app.domains.auth.service import AuthService

    service = AuthService(session, None)
    with pytest.raises(AuthenticationError):
        await service._load_user_or_raise(str(uuid.uuid4()))


async def test_load_user_or_raise_rejects_malformed_id(session):
    from app.domains.auth.service import AuthService

    service = AuthService(session, None)
    with pytest.raises(AuthenticationError):
        await service._load_user_or_raise("not-a-uuid")


def test_require_admin_rejects_anonymous():
    from app.graphql.middleware import AuthContext, require_admin

    with pytest.raises(Exception, match="Not authorized"):
        require_admin(AuthContext())


def test_require_admin_rejects_user_without_scope():
    from app.graphql.middleware import AuthContext, require_admin

    ctx = AuthContext()
    ctx.user_id = uuid.uuid4()
    ctx.scopes = ["wallet:read", "wallet:write"]
    with pytest.raises(Exception, match="Not authorized"):
        require_admin(ctx)


def test_require_admin_allows_admin():
    from app.graphql.middleware import AuthContext, require_admin

    ctx = AuthContext()
    ctx.user_id = uuid.uuid4()
    ctx.scopes = ["wallet:read", "wallet:write", "admin"]
    require_admin(ctx)  # must not raise


async def test_update_user_role_promotes_and_audits(session, make_account):
    from sqlalchemy import select

    from app.core.audit import AuditLog
    from app.domains.admin.service import AdminService

    admin, _wallet = await make_account()
    await promote(session, admin)
    target, _wallet2 = await make_account()

    service = AdminService(session)
    updated = await service.update_user_role(target.id, UserRole.ADMIN, actor_id=admin.id)

    assert updated.role == UserRole.ADMIN
    assert updated.updated_by == admin.id

    row = (
        await session.execute(select(AuditLog).where(AuditLog.resource_id == str(target.id)))
    ).scalar_one()
    assert row.user_id == admin.id
    assert row.action == "role.change"
    assert row.old_values == {"role": "MEMBER"}
    assert row.new_values == {"role": "ADMIN"}


async def test_update_user_role_demotes_when_other_admin_exists(session, make_account):
    from app.domains.admin.service import AdminService

    admin, _wallet = await make_account()
    await promote(session, admin)
    target, _wallet2 = await make_account()
    await promote(session, target)

    service = AdminService(session)
    updated = await service.update_user_role(target.id, UserRole.MEMBER, actor_id=admin.id)
    assert updated.role == UserRole.MEMBER


async def test_update_user_role_blocks_last_admin_demotion(session, make_account):
    from sqlalchemy import select

    from app.core.audit import AuditLog
    from app.core.errors import ValidationError
    from app.domains.admin.service import AdminService
    from app.domains.auth.models import User

    admin, _wallet = await make_account()
    await promote(session, admin)

    service = AdminService(session)
    with pytest.raises(ValidationError):
        await service.update_user_role(admin.id, UserRole.MEMBER, actor_id=admin.id)

    # Role unchanged and no audit row written.
    result = await session.execute(select(User).where(User.id == admin.id))
    assert result.scalar_one().role == UserRole.ADMIN
    rows = (
        await session.execute(select(AuditLog).where(AuditLog.resource_id == str(admin.id)))
    ).scalars().all()
    assert rows == []


async def test_update_user_role_suspended_admin_still_counts(session, make_account):
    from app.domains.admin.service import AdminService

    admin, _wallet = await make_account()
    await promote(session, admin)
    other, _wallet2 = await make_account()
    await promote(session, other)
    other.status = "SUSPENDED"  # matches existing suspend_user convention
    await session.commit()

    service = AdminService(session)
    updated = await service.update_user_role(admin.id, UserRole.MEMBER, actor_id=other.id)
    assert updated.role == UserRole.MEMBER


async def test_update_user_role_unknown_user_raises(session, make_account):
    from app.core.errors import NotFoundError
    from app.domains.admin.service import AdminService

    admin, _wallet = await make_account()
    await promote(session, admin)

    service = AdminService(session)
    with pytest.raises(NotFoundError):
        await service.update_user_role(uuid.uuid4(), UserRole.ADMIN, actor_id=admin.id)


def test_rbac_member_and_merchant_have_no_admin_perms():
    from app.core.rbac import Permission, has_permission
    from app.domains.auth.models import UserRole

    assert has_permission(UserRole.MEMBER, Permission.PLATFORM_STATS) is False
    assert has_permission(UserRole.MERCHANT, Permission.PLATFORM_STATS) is False
    assert has_permission(UserRole.MERCHANT, Permission.USERS_READ) is False


def test_rbac_admin_has_all_perms():
    from app.core.rbac import Permission, ROLE_PERMISSIONS
    from app.domains.auth.models import UserRole

    admin_perms = ROLE_PERMISSIONS[UserRole.ADMIN]
    assert Permission.USERS_READ in admin_perms
    assert Permission.USERS_CHANGE_ROLE in admin_perms
    assert Permission.PLATFORM_STATS in admin_perms
    assert Permission.CASH_OPERATE in admin_perms
    assert Permission.REPORTS_EXPORT in admin_perms


def test_permissions_for_returns_sorted_strings():
    from app.core.rbac import permissions_for
    from app.domains.auth.models import UserRole

    perms = permissions_for(UserRole.ADMIN)
    assert perms == sorted(perms)
    assert "users:read" in perms
    assert "platform:stats" in perms
    assert permissions_for(UserRole.MEMBER) == []


def test_require_perms_allows_admin_perm_denies_member():
    import uuid

    from app.core.rbac import Permission
    from app.graphql.middleware import AuthContext, require_perms

    admin_ctx = AuthContext()
    admin_ctx.user_id = uuid.uuid4()
    admin_ctx.scopes = ["wallet:read", "wallet:write", "users:read", "admin"]
    require_perms(admin_ctx, Permission.USERS_READ)  # must not raise

    member_ctx = AuthContext()
    member_ctx.user_id = uuid.uuid4()
    member_ctx.scopes = ["wallet:read", "wallet:write"]
    try:
        require_perms(member_ctx, Permission.USERS_READ)
    except Exception as e:
        assert str(e) == "Not authorized"
    else:
        raise AssertionError("member should have been rejected")


def test_require_roles_accepts_admin_rejects_member():
    import uuid

    from app.domains.auth.models import UserRole
    from app.graphql.middleware import AuthContext, require_roles

    ctx = AuthContext()
    ctx.user_id = uuid.uuid4()
    ctx.role = UserRole.ADMIN
    require_roles(ctx, UserRole.ADMIN)

    ctx.role = UserRole.MEMBER
    try:
        require_roles(ctx, UserRole.ADMIN)
    except Exception as e:
        assert str(e) == "Not authorized"
    else:
        raise AssertionError("member should have been rejected")


def test_login_scopes_carry_permissions_plus_legacy_admin():
    from app.core.rbac import permissions_for
    from app.domains.auth.models import User, UserRole

    admin = User(email="a@t", phone="09180000001", password_hash="x", role=UserRole.ADMIN)
    perms = permissions_for(admin.role)
    assert "users:read" in perms


def test_member_token_cannot_read_admin_users():
    import uuid
    from app.core.rbac import Permission
    from app.graphql.middleware import AuthContext, require_perms
    member = AuthContext()
    member.user_id = uuid.uuid4()
    member.scopes = ["wallet:read", "wallet:write"]
    try:
        require_perms(member, Permission.USERS_READ)
    except Exception as e:
        assert str(e) == "Not authorized"
    else:
        raise AssertionError("member must not pass USERS_READ")


async def test_update_user_role_blocks_self_demote_to_member(session, make_account):
    from app.core.errors import ValidationError
    from app.domains.admin.service import AdminService
    from app.domains.auth.models import UserRole

    admin, _w = await make_account()
    await promote(session, admin)
    other, _w2 = await make_account()
    await promote(session, other)

    service = AdminService(session)
    with pytest.raises(ValidationError, match="own account"):
        await service.update_user_role(admin.id, UserRole.MEMBER, actor_id=admin.id)
