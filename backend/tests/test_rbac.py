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


def test_scopes_for_admin_include_admin():
    from app.domains.auth.service import _scopes_for

    admin = User(
        email="rbac-admin-unit@ccash.test",
        phone="09189990001",
        password_hash="x",
        role=UserRole.ADMIN,
    )
    assert _scopes_for(admin) == ["wallet:read", "wallet:write", "admin"]


def test_scopes_for_regular_user_has_no_admin():
    from app.domains.auth.service import _scopes_for

    user = User(
        email="rbac-user-unit@ccash.test",
        phone="09189990002",
        password_hash="x",
    )  # column default USER
    assert _scopes_for(user) == ["wallet:read", "wallet:write"]


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
    assert row.old_values == {"role": "USER"}
    assert row.new_values == {"role": "ADMIN"}


async def test_update_user_role_demotes_when_other_admin_exists(session, make_account):
    from app.domains.admin.service import AdminService

    admin, _wallet = await make_account()
    await promote(session, admin)
    target, _wallet2 = await make_account()
    await promote(session, target)

    service = AdminService(session)
    updated = await service.update_user_role(target.id, UserRole.USER, actor_id=admin.id)
    assert updated.role == UserRole.USER


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
        await service.update_user_role(admin.id, UserRole.USER, actor_id=admin.id)

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
    updated = await service.update_user_role(admin.id, UserRole.USER, actor_id=other.id)
    assert updated.role == UserRole.USER


async def test_update_user_role_unknown_user_raises(session, make_account):
    from app.core.errors import NotFoundError
    from app.domains.admin.service import AdminService

    admin, _wallet = await make_account()
    await promote(session, admin)

    service = AdminService(session)
    with pytest.raises(NotFoundError):
        await service.update_user_role(uuid.uuid4(), UserRole.ADMIN, actor_id=admin.id)
