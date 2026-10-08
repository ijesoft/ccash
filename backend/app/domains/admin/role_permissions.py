"""DB-backed role → permissions mapping (super-admin managed).

One row per granted permission; no row means denied. This is a pure mapping
table: updates hard-delete and re-insert a role's rows in one transaction
(history is covered by the `audit_logs` row written per update). SUPER_ADMIN
is never stored — it is synthesized as "all permissions".
"""

import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import Field, SQLModel

from app.core.audit import AuditLog
from app.core.errors import ValidationError
from app.core.rbac import ROLE_PERMISSIONS, Permission
from app.domains.auth.models import UserRole


class RolePermission(SQLModel, table=True):
    __tablename__ = "role_permissions"

    role: str = Field(primary_key=True, max_length=20)
    permission: str = Field(primary_key=True, max_length=64)


class RolePermissionService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_matrix(self) -> dict[str, list[str]]:
        """{role: sorted permissions} for all five roles.

        Falls back to the ROLE_PERMISSIONS constants when the table is empty
        (fresh DB before migration 009, or tests that truncate between cases).
        """
        rows = (await self.session.execute(select(RolePermission))).scalars().all()
        matrix: dict[str, list[str]] = {role.value: [] for role in UserRole}
        if not rows:
            for role, fallback in ROLE_PERMISSIONS.items():
                matrix[role.value] = sorted(p.value for p in fallback)
        else:
            for row in rows:
                if row.role in matrix:
                    matrix[row.role].append(row.permission)
        matrix[UserRole.SUPER_ADMIN.value] = sorted(p.value for p in Permission)
        return {role: sorted(perms) for role, perms in matrix.items()}

    async def set_role_permissions(
        self,
        role: UserRole,
        permissions: list[str],
        actor_id: uuid.UUID,
        actor_role: UserRole | None,
    ) -> list[str]:
        """Replace a role's permission set; returns the sorted new set."""
        if actor_role != UserRole.SUPER_ADMIN:
            raise ValidationError("Only a super admin can change role permissions")
        if role == UserRole.SUPER_ADMIN:
            raise ValidationError("Super admin permissions cannot be changed")
        want = sorted(set(permissions))
        unknown = [p for p in want if p not in {perm.value for perm in Permission}]
        if unknown:
            raise ValidationError(f"Unknown permissions: {', '.join(unknown)}")

        current = sorted(
            r.permission
            for r in (
                await self.session.execute(
                    select(RolePermission).where(RolePermission.role == role.value)
                )
            )
            .scalars()
            .all()
        )
        await self.session.execute(
            delete(RolePermission).where(RolePermission.role == role.value)
        )
        for perm in want:
            self.session.add(RolePermission(role=role.value, permission=perm))
        self.session.add(
            AuditLog(
                user_id=actor_id,
                action="rbac.update",
                resource_type="role",
                resource_id=role.value,
                old_values={"permissions": current},
                new_values={"permissions": want},
            )
        )
        await self.session.commit()
        return want
