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
