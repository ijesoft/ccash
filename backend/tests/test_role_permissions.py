"""RBAC role-permissions management (super-admin only).

Covers docs/superpowers/specs/2026-10-01-rbac-role-permissions-design.md.
Service layer exercised directly against the Alembic-migrated ccash_test
database (same convention as test_rbac.py).
"""

import uuid

import pytest

from app.core.errors import ValidationError
from app.domains.auth.models import UserRole


async def make_super_admin(session, make_account):
    admin, _wallet = await make_account()
    admin.role = UserRole.SUPER_ADMIN
    await session.commit()
    return admin


async def test_matrix_falls_back_to_constants_on_empty_table(session):
    from app.domains.admin.role_permissions import RolePermissionService

    matrix = await RolePermissionService(session).get_matrix()
    assert matrix["ADMIN"] == sorted(matrix["ADMIN"])
    assert "users:read" in matrix["ADMIN"]
    assert len(matrix["ADMIN"]) == 19
    assert matrix["MEMBER"] == []
    assert matrix["MERCHANT"] == []
    assert len(matrix["SUPER_ADMIN"]) == 19


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
