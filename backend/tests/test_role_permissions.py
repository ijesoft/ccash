"""RBAC role-permissions management (super-admin only).

Covers docs/superpowers/specs/2026-10-01-rbac-role-permissions-design.md.
Service layer exercised directly against the Alembic-migrated ccash_test
database (same convention as test_rbac.py).
"""

import pytest

from app.core.errors import ValidationError
from app.domains.auth.models import UserRole


async def make_super_admin(session, make_account):
    admin, _wallet = await make_account()
    admin.role = UserRole.SUPER_ADMIN
    await session.commit()
    return admin


async def test_matrix_falls_back_to_constants_on_empty_table(session):
    from app.core.rbac import Permission
    from app.domains.admin.role_permissions import RolePermissionService

    matrix = await RolePermissionService(session).get_matrix()
    assert matrix["ADMIN"] == sorted(matrix["ADMIN"])
    assert "users:read" in matrix["ADMIN"]
    assert len(matrix["ADMIN"]) == len(Permission)
    assert matrix["MEMBER"] == []
    assert matrix["MERCHANT"] == []
    assert len(matrix["SUPER_ADMIN"]) == len(Permission)


async def test_super_admin_can_grant_member_permission(session, make_account):
    from sqlalchemy import select

    from app.core.audit import AuditLog
    from app.domains.admin.role_permissions import RolePermission, RolePermissionService

    actor = await make_super_admin(session, make_account)
    service = RolePermissionService(session)

    updated = await service.set_role_permissions(
        UserRole.MEMBER, ["users:read"], actor.id, actor.role
    )
    assert updated == ["users:read"]

    matrix = await service.get_matrix()
    assert matrix["MEMBER"] == ["users:read"]

    row = (
        await session.execute(select(AuditLog).where(AuditLog.action == "rbac.update"))
    ).scalar_one()
    assert row.user_id == actor.id
    assert row.resource_type == "role"
    assert row.resource_id == "MEMBER"
    assert row.old_values == {"permissions": []}
    assert row.new_values == {"permissions": ["users:read"]}

    stored = (
        await session.execute(select(RolePermission).where(RolePermission.role == "MEMBER"))
    ).scalars().all()
    assert [r.permission for r in stored] == ["users:read"]


async def test_clearing_admin_to_empty_is_round_trip_stable(session, make_account):
    from app.domains.admin.role_permissions import RolePermissionService

    actor = await make_super_admin(session, make_account)
    service = RolePermissionService(session)

    # Table non-empty (MEMBER holds a grant) while ADMIN is cleared: the
    # realistic path. (A fully-empty table means fresh state and falls back
    # to defaults by design; display and enforcement both read get_matrix,
    # so they can never diverge.)
    await service.set_role_permissions(
        UserRole.MEMBER, ["users:read"], actor.id, actor.role
    )
    assert await service.set_role_permissions(UserRole.ADMIN, [], actor.id, actor.role) == []
    matrix = await service.get_matrix()
    assert matrix["ADMIN"] == []
    assert matrix["MEMBER"] == ["users:read"]


async def test_none_actor_role_is_rejected(session, make_account):
    import uuid

    from app.domains.admin.role_permissions import RolePermissionService

    await make_super_admin(session, make_account)
    with pytest.raises(ValidationError, match="Only a super admin"):
        await RolePermissionService(session).set_role_permissions(
            UserRole.MEMBER, ["users:read"], uuid.uuid4(), None
        )


async def test_duplicate_permissions_are_deduped(session, make_account):
    from app.domains.admin.role_permissions import RolePermissionService

    actor = await make_super_admin(session, make_account)
    updated = await RolePermissionService(session).set_role_permissions(
        UserRole.MEMBER, ["users:read", "users:read"], actor.id, actor.role
    )
    assert updated == ["users:read"]


async def test_permissions_for_role_reads_db_then_falls_back(session, make_account):
    from app.core.rbac import permissions_for_role
    from app.domains.admin.role_permissions import RolePermissionService
    from app.domains.auth.models import UserRole

    actor = await make_super_admin(session, make_account)

    # Empty table (truncated between tests) falls back to constants.
    assert await permissions_for_role(session, UserRole.MEMBER) == []
    assert "users:read" in await permissions_for_role(session, UserRole.ADMIN)

    # After a DB write, the DB wins over the constants.
    await RolePermissionService(session).set_role_permissions(
        UserRole.MEMBER, ["users:read", "platform:stats"], actor.id, actor.role
    )
    assert await permissions_for_role(session, UserRole.MEMBER) == [
        "platform:stats",
        "users:read",
    ]
