"""Extensible RBAC: roles bundle permissions, resolvers check permissions.

Adding a role = add UserRole member + one ROLE_PERMISSIONS entry + one
Alembic `ALTER TYPE userrole ADD VALUE` migration. Resolvers using
require_perms() need no changes.
"""

import enum

from app.domains.auth.models import UserRole


class Permission(str, enum.Enum):
    PLATFORM_STATS = "platform:stats"
    USERS_READ = "users:read"
    USERS_CREATE = "users:create"
    USERS_UPDATE = "users:update"
    USERS_SUSPEND = "users:suspend"
    USERS_DELETE = "users:delete"
    USERS_RESET_PASSWORD = "users:reset-password"
    USERS_CHANGE_ROLE = "users:change-role"
    USERS_SET_ID = "users:set-id"
    MERCHANTS_READ = "merchants:read"
    MERCHANTS_UPDATE = "merchants:update"
    MERCHANTS_SET_ID = "merchants:set-id"
    TX_READ_ALL = "transactions:read-all"
    CASH_OPERATE = "cash:operate"
    REPORTS_EXPORT = "reports:export"
    MASTERLIST_READ = "masterlist:read"
    MASTERLIST_WRITE = "masterlist:write"
    BRANDING_WRITE = "branding:write"
    KYC_REVIEW = "kyc:review"
    AUDIT_READ = "audit:read"
    AUDIT_EXPORT = "audit:export"
    USERS_RECOVER_PASSWORD = "users:recover-password"


_ALL = frozenset(Permission)

ROLE_PERMISSIONS: dict[UserRole, frozenset[Permission]] = {
    UserRole.MEMBER: frozenset(),
    UserRole.MERCHANT: frozenset(),
    UserRole.ADMIN: _ALL,
    UserRole.SUPER_ADMIN: _ALL,
    UserRole.AUDITOR: frozenset(
        {
            Permission.PLATFORM_STATS,
            Permission.USERS_READ,
            Permission.MERCHANTS_READ,
            Permission.TX_READ_ALL,
            Permission.AUDIT_READ,
            Permission.AUDIT_EXPORT,
        }
    ),
}


def permissions_for(role: UserRole) -> list[str]:
    return sorted(p.value for p in ROLE_PERMISSIONS.get(role, frozenset()))


def has_permission(role: UserRole, perm: Permission | str) -> bool:
    want = perm.value if isinstance(perm, Permission) else perm
    return any(p.value == want for p in ROLE_PERMISSIONS.get(role, frozenset()))


async def permissions_for_role(session, role: UserRole) -> list[str]:
    """DB-backed permissions for a role, falling back to constants.

    Reads `role_permissions` rows first. Falls back to the ROLE_PERMISSIONS
    constant only when the whole table is empty (fresh DB before migration
    009, or truncated test DB) — a role with no rows in a non-empty table
    was intentionally cleared and resolves to []. SUPER_ADMIN always
    resolves to every Permission. The import is lazy:
    `role_permissions.py` imports Permission from this module.
    """
    from sqlalchemy import select

    from app.domains.admin.role_permissions import RolePermission

    if role == UserRole.SUPER_ADMIN:
        return sorted(p.value for p in Permission)
    rows = (
        await session.execute(
            select(RolePermission.permission).where(RolePermission.role == role.value)
        )
    ).all()
    perms = sorted(r[0] for r in rows)
    if perms:
        unknown = [p for p in perms if p not in {perm.value for perm in Permission}]
        if not unknown:
            return perms
    table_has_any = (
        await session.execute(select(RolePermission).limit(1))
    ).first() is not None
    if not table_has_any:
        return permissions_for(role)
    return perms
