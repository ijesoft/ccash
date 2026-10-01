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


_ALL = frozenset(Permission)

ROLE_PERMISSIONS: dict[UserRole, frozenset[Permission]] = {
    UserRole.MEMBER: frozenset(),
    UserRole.MERCHANT: frozenset(),
    UserRole.ADMIN: _ALL,
    UserRole.SUPER_ADMIN: _ALL,
}


def permissions_for(role: UserRole) -> list[str]:
    return sorted(p.value for p in ROLE_PERMISSIONS.get(role, frozenset()))


def has_permission(role: UserRole, perm: Permission | str) -> bool:
    want = perm.value if isinstance(perm, Permission) else perm
    return any(p.value == want for p in ROLE_PERMISSIONS.get(role, frozenset()))
