# RBAC Role-Permissions Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a super-admin-only `/super-admin/roles` page with a per-role permission matrix, backed by a new `role_permissions` table, enforced by the backend and reflected in frontend gating.

**Architecture:** New `role_permissions` mapping table (hard-delete + re-insert per update, history via `audit_logs`) seeded from today's constants. `permissions_for()` stays as the sync fallback; new async `permissions_for_role(session, role)` reads the DB first. JWT issuance and `AuthPayload.scopes` use the DB path, so edits take effect on next login/refresh with no resolver changes.

**Tech Stack:** Python 3.13 / FastAPI / Strawberry GraphQL / SQLModel / Alembic / pytest — React 19 / Apollo Client / MUI / TypeScript strict.

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `backend/migrations/versions/009_role_permissions.py` | Create | Create `role_permissions` table + seed ADMIN rows |
| `backend/app/domains/admin/role_permissions.py` | Create | `RolePermission` model + `RolePermissionService` (matrix read, validated replace + audit) |
| `backend/app/core/rbac.py` | Modify | Add async `permissions_for_role(session, role)`; sync `permissions_for` untouched (fallback) |
| `backend/app/domains/auth/service.py` | Modify | Replace sync `_scopes_for` with async `scopes_for_user(session, user)`; use in `complete_login` + `refresh_token` |
| `backend/app/domains/auth/graphql.py` | Modify | `AuthPayload` gains `scopes: list[str]`; both resolvers populate it |
| `backend/app/domains/admin/graphql.py` | Modify | `RolePermissionsType` + `rolePermissions` query + `updateRolePermissions` mutation (both `require_roles(SUPER_ADMIN)`) |
| `backend/tests/conftest.py` | Modify | Add `role_permissions` to TRUNCATE list |
| `backend/tests/test_rbac.py` | Modify | Convert the two `_scopes_for` tests to async `scopes_for_user` |
| `backend/tests/test_role_permissions.py` | Create | 7 service-level tests for the new behavior |
| `frontend/src/graphql/queries/admin.ts` | Modify | Add `GET_ROLE_PERMISSIONS` + `UPDATE_ROLE_PERMISSIONS` |
| `frontend/src/graphql/mutations/auth.ts` | Modify | Select `scopes` in `COMPLETE_LOGIN` + `REFRESH_TOKEN` |
| `frontend/src/types/index.ts` | Modify | `AuthPayload` gains `scopes: string[]` |
| `frontend/src/context/AuthContext.tsx` | Modify | Persist live scopes; `can()` prefers scopes, falls back to role mirror |
| `frontend/src/pages/SuperAdminRoles.tsx` | Create | Grouped permission matrix page with per-role Save |
| `frontend/src/App.tsx` | Modify | Route `/super-admin/roles` behind `RequireSuperAdmin` |
| `frontend/src/components/Layout.tsx` | Modify | Sidebar `Roles` entry (`superOnly: true`) |

Work continues on the current branch `feat/rbac-extensible` (spec commit `5b6542c` is already on it).

The 19 permission strings (exact, must match `Permission` enum values): `platform:stats`, `users:read`, `users:create`, `users:update`, `users:suspend`, `users:delete`, `users:reset-password`, `users:change-role`, `users:set-id`, `merchants:read`, `merchants:update`, `merchants:set-id`, `transactions:read-all`, `cash:operate`, `reports:export`, `masterlist:read`, `masterlist:write`, `branding:write`, `kyc:review`.

---

### Task 1: Migration 009 creates and seeds `role_permissions`

**Files:**
- Create: `backend/migrations/versions/009_role_permissions.py`
- Modify: `backend/tests/conftest.py` (TRUNCATE list, line 89)

- [ ] **Step 1: Write the migration file**

```python
"""role_permissions mapping table seeded from ROLE_PERMISSIONS constants.

Revision ID: 009
Revises: 008
Create Date: 2026-10-01

One row per granted permission, e.g. ('ADMIN', 'users:read'). No row means
denied. SUPER_ADMIN gets no rows: it is synthesized as "all permissions" in
code (see RolePermissionService.get_matrix). MEMBER/MERCHANT start empty.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "009"
down_revision: Union[str, None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_ADMIN_PERMISSIONS = (
    "platform:stats",
    "users:read",
    "users:create",
    "users:update",
    "users:suspend",
    "users:delete",
    "users:reset-password",
    "users:change-role",
    "users:set-id",
    "merchants:read",
    "merchants:update",
    "merchants:set-id",
    "transactions:read-all",
    "cash:operate",
    "reports:export",
    "masterlist:read",
    "masterlist:write",
    "branding:write",
    "kyc:review",
)


def upgrade() -> None:
    op.create_table(
        "role_permissions",
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("permission", sa.String(length=64), nullable=False),
        sa.PrimaryKeyConstraint("role", "permission"),
    )
    values = ", ".join(f"('ADMIN', '{p}')" for p in _ADMIN_PERMISSIONS)
    op.execute(sa.text(f"INSERT INTO role_permissions (role, permission) VALUES {values}"))


def downgrade() -> None:
    op.drop_table("role_permissions")
```

- [ ] **Step 2: Add the table to the test TRUNCATE list**

In `backend/tests/conftest.py`, change line 89 from:

```python
"TRUNCATE notifications, transactions, favorites, "
"kyc_documents, audit_logs, merchant_profiles, wallets, users, master_list_entries CASCADE"
```

to:

```python
"TRUNCATE notifications, transactions, favorites, "
"kyc_documents, audit_logs, merchant_profiles, wallets, users, master_list_entries, role_permissions CASCADE"
```

Rationale: truncation gives each test an empty table, so tests are order-independent. Tests set up their own rows via the service; the empty-table fallback path (Task 3) returns the same defaults as the seed, so default-behavior assertions stay valid.

- [ ] **Step 3: Run the migration and verify seed rows**

Run: `cd backend && ./.venv/bin/python -m alembic -c migrations/alembic.ini upgrade head`
Expected: `Running upgrade 008 -> 009` (or `... -> 009, role_permissions mapping table...`) with no error.

Run: `docker exec ccash-postgres psql -U ccash -d ccash -c "SELECT role, count(*) FROM role_permissions GROUP BY role;"`
Expected: one row — `ADMIN | 19`.

- [ ] **Step 4: Commit**

```bash
git add backend/migrations/versions/009_role_permissions.py backend/tests/conftest.py
git commit -m "feat: add role_permissions table seeded with admin grants"
```

---

### Task 2: `RolePermission` model + `RolePermissionService`

**Files:**
- Create: `backend/app/domains/admin/role_permissions.py`
- Test: `backend/tests/test_role_permissions.py` (skeleton, first 2 tests only — remaining tests arrive in Task 4)

`role_permissions.py` imports `Permission` only inside methods that need it, and never imports `app.core.rbac` at module level: `rbac.py` will lazily import this module (Task 3), so a top-level import back would be circular. The model stores plain strings; all enum validation lives in the service.

- [ ] **Step 1: Write failing tests for matrix read + fallback**

Create `backend/tests/test_role_permissions.py` with:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ./.venv/bin/python -m pytest tests/test_role_permissions.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.domains.admin.role_permissions'` (collection error).

- [ ] **Step 3: Write minimal implementation**

Create `backend/app/domains/admin/role_permissions.py` with:

```python
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
from app.domains.auth.models import UserRole


class RolePermission(SQLModel, table=True):
    __tablename__ = "role_permissions"

    role: str = Field(primary_key=True, max_length=20)
    permission: str = Field(primary_key=True, max_length=64)


class RolePermissionService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_matrix(self) -> dict[str, list[str]]:
        """{role: sorted permissions} for all four roles.

        Falls back to the ROLE_PERMISSIONS constants when the table has no
        rows for a role (fresh DB before migration 009, or tests that
        truncate between cases).
        """
        from app.core.rbac import ROLE_PERMISSIONS, Permission

        rows = (await self.session.execute(select(RolePermission))).scalars().all()
        matrix: dict[str, list[str]] = {role.value: [] for role in UserRole}
        for row in rows:
            matrix.setdefault(row.role, []).append(row.permission)
        for role, fallback in ROLE_PERMISSIONS.items():
            if not matrix.get(role.value):
                matrix[role.value] = sorted(p.value for p in fallback)
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
        from app.core.rbac import Permission

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
```

Note: `create_tables()` picks up the model because `app/domains/admin/graphql.py` (imported by the root schema at app startup) will import this module in Task 5.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && ./.venv/bin/python -m pytest tests/test_role_permissions.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/domains/admin/role_permissions.py backend/tests/test_role_permissions.py
git commit -m "feat: role permission matrix service with audit"
```

---

### Task 3: Async DB-backed `permissions_for_role` in `rbac.py`

**Files:**
- Modify: `backend/app/core/rbac.py`
- Test: `backend/tests/test_role_permissions.py` (append)

The sync `permissions_for()` and `ROLE_PERMISSIONS` stay exactly as-is (existing `test_rbac.py` tests pin them). The lazy import inside the function avoids a circular import (`role_permissions.py` methods import `Permission` from this module).

- [ ] **Step 1: Write the failing test (append to `test_role_permissions.py`)**

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./.venv/bin/python -m pytest tests/test_role_permissions.py::test_permissions_for_role_reads_db_then_falls_back -v`
Expected: FAIL with `ImportError` (`cannot import name 'permissions_for_role'`).

- [ ] **Step 3: Write minimal implementation (append to `backend/app/core/rbac.py`)**

```python
async def permissions_for_role(session, role: UserRole) -> list[str]:
    """DB-backed permissions for a role, falling back to constants.

    Reads `role_permissions` rows first; when the role has no rows (fresh DB
    before migration 009, or truncated test DB), returns the
    ROLE_PERMISSIONS constant so login never breaks. SUPER_ADMIN always
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
    if not perms:
        return permissions_for(role)
    unknown = [p for p in perms if p not in {perm.value for perm in Permission}]
    if unknown:
        return permissions_for(role)
    return perms
```

The `session` parameter is intentionally untyped as `AsyncSession` import at module level would add an sqlalchemy dependency to this leaf module; the lazy imports keep `rbac.py` importable from tests without a DB. (Keep the existing imports and functions above this addition untouched.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && ./.venv/bin/python -m pytest tests/test_role_permissions.py tests/test_rbac.py tests/test_super_admin.py -v`
Expected: PASS (all pass — sync paths untouched).

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/rbac.py backend/tests/test_role_permissions.py
git commit -m "feat: db-backed permissions_for_role with constants fallback"
```

---

### Task 4: Rejection + revocation tests for the service

**Files:**
- Test: `backend/tests/test_role_permissions.py` (append 4 tests; no source change expected — tests must pass on the Task 2 implementation)

- [ ] **Step 1: Append the four tests**

```python
async def test_non_super_admin_actor_is_rejected(session, make_account):
    from sqlalchemy import select

    from app.domains.admin.role_permissions import RolePermission, RolePermissionService
    from app.domains.auth.models import UserRole

    admin, _wallet = await make_account()
    admin.role = UserRole.ADMIN
    await session.commit()

async def test_non_super_admin_actor_is_rejected(session, make_account):
    from sqlalchemy import select

    from app.domains.admin.role_permissions import RolePermission, RolePermissionService
    from app.domains.auth.models import UserRole

    admin, _wallet = await make_account()
    admin.role = UserRole.ADMIN
    await session.commit()

    with pytest.raises(ValidationError, match="Only a super admin"):
        await RolePermissionService(session).set_role_permissions(
            UserRole.MEMBER, ["users:read"], admin.id, admin.role
        )

    rows = (
        await session.execute(
            select(RolePermission).where(RolePermission.role == "MEMBER")
        )
    ).scalars().all()
    assert rows == []


async def test_unknown_permission_rejected_with_no_partial_write(session, make_account):
    from sqlalchemy import select

    from app.domains.admin.role_permissions import RolePermission, RolePermissionService
    from app.domains.auth.models import UserRole

    actor = await make_super_admin(session, make_account)

    with pytest.raises(ValidationError, match="Unknown permissions: bogus:perm"):
        await RolePermissionService(session).set_role_permissions(
            UserRole.MEMBER, ["users:read", "bogus:perm"], actor.id, actor.role
        )

    rows = (
        await session.execute(
            select(RolePermission).where(RolePermission.role == "MEMBER")
        )
    ).scalars().all()
    assert rows == []


async def test_super_admin_role_edit_is_rejected(session, make_account):
    from app.domains.admin.role_permissions import RolePermissionService
    from app.domains.auth.models import UserRole

    actor = await make_super_admin(session, make_account)

    with pytest.raises(ValidationError, match="cannot be changed"):
        await RolePermissionService(session).set_role_permissions(
            UserRole.SUPER_ADMIN, [], actor.id, actor.role
        )


async def test_revoked_permission_blocks_require_perms(session, make_account):
    import uuid

    from app.core.rbac import Permission, permissions_for_role
    from app.domains.admin.role_permissions import RolePermissionService
    from app.domains.auth.models import UserRole
    from app.graphql.middleware import AuthContext, require_perms

    actor = await make_super_admin(session, make_account)
    service = RolePermissionService(session)

    full = await permissions_for_role(session, UserRole.ADMIN)
    assert "users:read" in full
    reduced = sorted(p for p in full if p != "users:read")
    await service.set_role_permissions(UserRole.ADMIN, reduced, actor.id, actor.role)

    ctx = AuthContext()
    ctx.user_id = uuid.uuid4()
    ctx.scopes = ["wallet:read", "wallet:write"] + await permissions_for_role(
        session, UserRole.ADMIN
    )
    try:
        require_perms(ctx, Permission.USERS_READ)
    except Exception as e:
        assert str(e) == "Not authorized"
    else:
        raise AssertionError("revoked users:read must be rejected")
```

`ValidationError` and `pytest` are already imported at the top of the file from Task 2.

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd backend && ./.venv/bin/python -m pytest tests/test_role_permissions.py -v`
Expected: PASS (7 passed). If any fail, fix the implementation from Task 2 (do not weaken the test).

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_role_permissions.py
git commit -m "test: role permission rejection and revocation cases"
```

---

### Task 5: GraphQL query + mutation (super-admin only)

**Files:**
- Modify: `backend/app/domains/admin/graphql.py`

Follows the existing resolver pattern: `require_roles` guard, `try/finally` with `session.close()`, domain errors mapped to `Exception(str(e))`.

- [ ] **Step 1: Add the type, query, and mutation**

Add the import (alongside the existing `AdminService` import at line 10):

```python
from app.domains.admin.role_permissions import RolePermissionService
```

Add the type after `BrandingType` (after line 74):

```python
@strawberry.type
class RolePermissionsType:
    role: str
    permissions: list[str]
```

Add the query to `AdminQueries` after `audit_logs_count` (after line 184):

```python
    @strawberry.field
    async def role_permissions(self, info: Info) -> list[RolePermissionsType]:
        """Super-admin-only role → permission matrix for the Roles page."""
        require_roles(info.context, UserRole.SUPER_ADMIN)
        session = async_session_factory()
        try:
            matrix = await RolePermissionService(session).get_matrix()
            return [
                RolePermissionsType(role=role, permissions=perms)
                for role, perms in sorted(matrix.items())
            ]
        finally:
            await session.close()
```

Add the mutation to `AdminMutations` after `update_user_role` (at end of file, after line 430):

```python
    @strawberry.mutation
    async def update_role_permissions(
        self, info: Info, role: UserRoleEnum, permissions: list[str]
    ) -> list[str]:
        """Replace a role's permission set (SUPER_ADMIN itself is locked)."""
        require_roles(info.context, UserRole.SUPER_ADMIN)
        session = async_session_factory()
        try:
            actor_role = (
                UserRole(info.context.role) if info.context.role else None
            )
            return await RolePermissionService(session).set_role_permissions(
                UserRole(role.value),
                permissions,
                info.context.user_id,
                actor_role,
            )
        except ValidationError as e:
            raise Exception(str(e))
        finally:
            await session.close()
```

`UserRoleEnum`, `UserRole`, `require_roles`, `async_session_factory`, and `ValidationError` are all already imported in this file. No changes to the root schema file: `AdminQueries`/`AdminMutations` are picked up via the existing multiple-inheritance in `app/graphql/schema.py`.

- [ ] **Step 2: Verify nothing breaks**

Run: `cd backend && ./.venv/bin/python -m pytest tests/test_role_permissions.py tests/test_rbac.py -v`
Expected: PASS.

Run: `cd backend && ./.venv/bin/python -c "import app.graphql.schema as s; names=[f.name for f in s.schema.query.fields]; assert 'rolePermissions' in names, names; print('rolePermissions OK')"`
Expected: prints `rolePermissions OK`. (If the schema object is exposed under a different name, inspect `app/graphql/schema.py` first and adjust the snippet — the goal is to prove the field is registered.)

- [ ] **Step 3: Commit**

```bash
git add backend/app/domains/admin/graphql.py
git commit -m "feat: super-admin rolePermissions query and mutation"
```

---

### Task 6: DB-backed scopes at login/refresh + `AuthPayload.scopes`

**Files:**
- Modify: `backend/app/domains/auth/service.py`
- Modify: `backend/app/domains/auth/graphql.py`
- Modify: `backend/tests/test_rbac.py` (the two `_scopes_for` tests only)

Service return tuples stay exactly as-is (`complete_login` → 3-tuple, `refresh_token` → 2-tuple), so `test_login_hardening.py` and `test_session_timeout.py` are unaffected. First confirm `_scopes_for` has no other callers: `rg "_scopes_for" backend/app backend/tests` must show only `service.py` (def + 2 call sites) and `test_rbac.py` (2 tests).

- [ ] **Step 1: Replace `_scopes_for` with async `scopes_for_user` in `service.py`**

Replace lines 37-42:

```python
def _scopes_for(user: User) -> list[str]:
    scopes = ["wallet:read", "wallet:write"]
    scopes.extend(permissions_for(user.role))
    if user.role in (UserRole.ADMIN, UserRole.SUPER_ADMIN) and "admin" not in scopes:
        scopes.append("admin")  # legacy shim, remove after frontend cutover
    return scopes
```

with:

```python
async def scopes_for_user(session: AsyncSession, user: User) -> list[str]:
    """JWT scopes for a user, read from the DB-backed role mapping.

    Falls back to the ROLE_PERMISSIONS constants when the table is empty,
    so login never breaks on a pre-009 database.
    """
    scopes = ["wallet:read", "wallet:write"]
    scopes.extend(await permissions_for_role(session, user.role))
    if user.role in (UserRole.ADMIN, UserRole.SUPER_ADMIN) and "admin" not in scopes:
        scopes.append("admin")  # legacy shim, remove after frontend cutover
    return scopes
```

Update the import at line 9 from `from app.core.rbac import permissions_for` to `from app.core.rbac import permissions_for_role`. `AsyncSession` is already imported (line 4).

Update line 279 in `complete_login` from:

```python
access_token = create_access_token(str(user.id), scopes=_scopes_for(user), role=user.role.value)
```

to:

```python
        access_token = create_access_token(
            str(user.id), scopes=await scopes_for_user(self.session, user), role=user.role.value
        )
```

Update line 309 in `refresh_token` from:

```python
new_access = create_access_token(user_id, scopes=_scopes_for(user), role=user.role.value)
```

to:

```python
        new_access = create_access_token(
            user_id, scopes=await scopes_for_user(self.session, user), role=user.role.value
        )
```

- [ ] **Step 2: Add `scopes` to `AuthPayload` and populate it in `graphql.py`**

Change lines 50-54 from:

```python
@strawberry.type
class AuthPayload:
    access_token: str
    refresh_token: str
    user: UserType
```

to:

```python
@strawberry.type
class AuthPayload:
    access_token: str
    refresh_token: str
    user: UserType
    scopes: list[str]
```

Add the import: `from app.domains.auth.service import AuthService, scopes_for_user` (line 11 currently imports only `AuthService`).

In `complete_login` resolver (lines 147-160), replace the return with:

```python
            access_token, refresh_token, user = await service.complete_login(email, id_no)
            scopes = await scopes_for_user(service.session, user)
            return AuthPayload(
                access_token=access_token,
                refresh_token=refresh_token,
                user=UserType.from_model(user),
                scopes=scopes,
            )
```

In `refresh_token` resolver (lines 162-177), replace the return with:

```python
            user = await service.repo.get_by_id(uuid.UUID(user_id))
            scopes = await scopes_for_user(service.session, user) if user else []
            return AuthPayload(
                access_token=access,
                refresh_token=new_refresh,
                user=UserType.from_model(user) if user else UserType(id="", email="", phone="", first_name=None, last_name=None, status="", kyc_level="", role="", is_2fa_enabled=False, is_verified=False, created_at=""),
                scopes=scopes,
            )
```

Keep the long `UserType(...)` fallback line exactly as-is, only adding the `scopes=scopes,` argument.

- [ ] **Step 3: Update the two `_scopes_for` tests in `test_rbac.py`**

Replace `test_scopes_for_admin_include_admin` (lines 23-36) with:

```python
async def test_scopes_for_admin_include_admin(session, make_account):
    from app.domains.auth.service import scopes_for_user

    admin, _wallet = await make_account()
    await promote(session, admin)
    scopes = await scopes_for_user(session, admin)
    assert scopes[:2] == ["wallet:read", "wallet:write"]
    assert "admin" in scopes
    assert "users:read" in scopes
    assert "platform:stats" in scopes
```

Replace `test_scopes_for_regular_user_has_no_admin` (lines 39-47) with:

```python
async def test_scopes_for_regular_user_has_no_admin(session, make_account):
    from app.domains.auth.service import scopes_for_user

    user, _wallet = await make_account()
    assert await scopes_for_user(session, user) == ["wallet:read", "wallet:write"]
```

(`promote` and `make_account` already exist in these files. Whether the table holds the 009 seed or was truncated, ADMIN resolves to all 19 and MEMBER to none, so these assertions are order-independent.)

- [ ] **Step 4: Run the full backend suite**

Run: `cd backend && ./.venv/bin/python -m pytest`
Expected: PASS — 88 existing + 7 new = 95 tests (plus the 2 converted tests, still counted in the 88).

- [ ] **Step 5: Commit**

```bash
git add backend/app/domains/auth/service.py backend/app/domains/auth/graphql.py backend/tests/test_rbac.py
git commit -m "feat: db-backed login scopes exposed on AuthPayload"
```

---

### Task 7: Frontend GraphQL operations + types

**Files:**
- Modify: `frontend/src/graphql/queries/admin.ts` (append)
- Modify: `frontend/src/graphql/mutations/auth.ts` (two selections)
- Modify: `frontend/src/types/index.ts` (`AuthPayload`)

- [ ] **Step 1: Append role-permission operations to `queries/admin.ts`**

```ts
export const GET_ROLE_PERMISSIONS = gql`
  query RolePermissions {
    rolePermissions {
      role
      permissions
    }
  }
`;

export const UPDATE_ROLE_PERMISSIONS = gql`
  mutation UpdateRolePermissions($role: UserRoleEnum!, $permissions: [String!]!) {
    updateRolePermissions(role: $role, permissions: $permissions)
  }
`;
```

- [ ] **Step 2: Select `scopes` on login + refresh in `mutations/auth.ts`**

In `COMPLETE_LOGIN`, after `refreshToken` (line 66) add a `scopes` line so the selection reads `accessToken / refreshToken / scopes / user {...}`. In `REFRESH_TOKEN`, after `refreshToken` (line 90) add `scopes`. Exact resulting blocks:

```ts
export const COMPLETE_LOGIN = gql`
  mutation CompleteLogin($email: String!, $idNo: String!) {
    completeLogin(email: $email, idNo: $idNo) {
      accessToken
      refreshToken
      scopes
      user {
        ...
      }
    }
  }
`;
```

(Keep the existing `user {...}` selection untouched.)

```ts
export const REFRESH_TOKEN = gql`
  mutation RefreshToken($refreshToken: String!) {
    refreshToken(refreshToken: $refreshToken) {
      accessToken
      refreshToken
      scopes
    }
  }
`;
```

- [ ] **Step 3: Extend the frontend `AuthPayload` type**

In `frontend/src/types/index.ts`, change:

```ts
export interface AuthPayload {
  accessToken: string;
  refreshToken: string;
  user: User;
}
```

to:

```ts
export interface AuthPayload {
  accessToken: string;
  refreshToken: string;
  scopes: string[];
  user: User;
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/graphql/queries/admin.ts frontend/src/graphql/mutations/auth.ts frontend/src/types/index.ts
git commit -m "feat: frontend role permission operations and scopes type"
```

(No build check yet — `SuperAdminRoles.tsx` in Task 8 is the first consumer; types are verified by the build in Task 10. If `tsc` complains that `scopes` is missing on cached payloads, that is handled in Task 9 by defaulting to `[]`.)

---

### Task 8: `SuperAdminRoles.tsx` matrix page + route + nav

**Files:**
- Create: `frontend/src/pages/SuperAdminRoles.tsx`
- Modify: `frontend/src/App.tsx` (import + route)
- Modify: `frontend/src/components/Layout.tsx` (import + nav entry)

- [ ] **Step 1: Write the page**

Create `frontend/src/pages/SuperAdminRoles.tsx` with the complete component below. It follows the `SuperAdminUsers.tsx` conventions (header `Stack` with `SUPER_ADMIN` chip, `Snackbar`/`Alert` feedback, `useQuery`/`useMutation` from Apollo). Roles `MEMBER`/`MERCHANT`/`ADMIN` are editable columns; `SUPER_ADMIN` renders as a locked all-checked column. One Save button per role, enabled only when that role is dirty.

```tsx
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useMutation, useQuery } from "@apollo/client";
import SupervisorAccountIcon from "@mui/icons-material/SupervisorAccount";
import LockIcon from "@mui/icons-material/Lock";
import { GET_ROLE_PERMISSIONS, UPDATE_ROLE_PERMISSIONS } from "../graphql/queries/admin";

type Role = "MEMBER" | "MERCHANT" | "ADMIN";
const EDITABLE_ROLES: Role[] = ["MEMBER", "MERCHANT", "ADMIN"];

const GROUPS: { title: string; perms: { value: string; label: string }[] }[] = [
  {
    title: "Users",
    perms: [
      { value: "users:read", label: "View users" },
      { value: "users:create", label: "Create members" },
      { value: "users:update", label: "Edit profiles" },
      { value: "users:suspend", label: "Suspend / activate" },
      { value: "users:delete", label: "Delete accounts" },
      { value: "users:reset-password", label: "Reset passwords" },
      { value: "users:change-role", label: "Change roles" },
      { value: "users:set-id", label: "Set member ID" },
    ],
  },
  {
    title: "Merchants",
    perms: [
      { value: "merchants:read", label: "View merchants" },
      { value: "merchants:update", label: "Edit merchants" },
      { value: "merchants:set-id", label: "Set merchant ID" },
    ],
  },
  {
    title: "Transactions & Cash",
    perms: [
      { value: "transactions:read-all", label: "Read all transactions" },
      { value: "cash:operate", label: "Cash in / out" },
    ],
  },
  {
    title: "Reports & Master List",
    perms: [
      { value: "reports:export", label: "Export reports" },
      { value: "masterlist:read", label: "View master list" },
      { value: "masterlist:write", label: "Edit master list" },
    ],
  },
  {
    title: "Platform",
    perms: [
      { value: "platform:stats", label: "Platform stats" },
      { value: "branding:write", label: "Edit branding" },
      { value: "kyc:review", label: "Review KYC" },
    ],
  },
];

interface RoleRow {
  role: string;
  permissions: string[];
}

export default function SuperAdminRoles() {
  const { data, loading, refetch } = useQuery<{ rolePermissions: RoleRow[] }>(GET_ROLE_PERMISSIONS);
  const [updateRole, { loading: saving }] = useMutation(UPDATE_ROLE_PERMISSIONS);
  const [draft, setDraft] = useState<Record<Role, string[]>>({ MEMBER: [], MERCHANT: [], ADMIN: [] });
  const [saved, setSaved] = useState<Record<Role, string[]>>({ MEMBER: [], MERCHANT: [], ADMIN: [] });
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({
    open: false,
    message: "",
    severity: "success",
  });

  useEffect(() => {
    if (!data?.rolePermissions) return;
    const next = { MEMBER: [] as string[], MERCHANT: [] as string[], ADMIN: [] as string[] };
    for (const row of data.rolePermissions) {
      if (row.role === "MEMBER" || row.role === "MERCHANT" || row.role === "ADMIN") {
        next[row.role] = [...row.permissions].sort();
      }
    }
    setDraft(next);
    setSaved(next);
  }, [data]);

  const dirty = useMemo<Record<Role, boolean>>(
    () =>
      ({
        MEMBER: JSON.stringify(draft.MEMBER) !== JSON.stringify(saved.MEMBER),
        MERCHANT: JSON.stringify(draft.MERCHANT) !== JSON.stringify(saved.MERCHANT),
        ADMIN: JSON.stringify(draft.ADMIN) !== JSON.stringify(saved.ADMIN),
      }) as Record<Role, boolean>,
    [draft, saved],
  );

  const toggle = (role: Role, perm: string) => {
    setDraft((d) => ({
      ...d,
      [role]: d[role].includes(perm)
        ? d[role].filter((p) => p !== perm).sort()
        : [...d[role], perm].sort(),
    }));
  };

  const save = async (role: Role) => {
    try {
      await updateRole({ variables: { role, permissions: draft[role] } });
      setSaved((s) => ({ ...s, [role]: [...draft[role]] }));
      setSnackbar({ open: true, message: `${role} permissions saved — applies on next login`, severity: "success" });
      refetch();
    } catch (err: unknown) {
      setSnackbar({ open: true, message: err instanceof Error ? err.message : "Save failed", severity: "error" });
    }
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5" fontWeight="bold">Roles & Access</Typography>
        <Chip icon={<SupervisorAccountIcon />} label="SUPER ADMIN" color="error" variant="outlined" size="small" />
      </Stack>
      <Typography variant="body2" color="text.secondary" mb={2}>
        Toggle what each role can do. SUPER_ADMIN always keeps every permission. Changes apply when a user next
        logs in or refreshes their session.
      </Typography>
      <Paper elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, overflowX: "auto" }}>
        <Table size="small" aria-label="Role permissions matrix">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Permission</TableCell>
              {EDITABLE_ROLES.map((role) => (
                <TableCell key={role} align="center" sx={{ fontWeight: 700 }}>
                  {role}
                </TableCell>
              ))}
              <TableCell align="center" sx={{ fontWeight: 700 }}>
                <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="center">
                  <span>SUPER_ADMIN</span>
                  <LockIcon fontSize="inherit" color="disabled" />
                </Stack>
              </TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {GROUPS.map((group) => (
              <>
                <TableRow key={group.title}>
                  <TableCell colSpan={6} sx={{ fontWeight: 700, bgcolor: "action.hover" }}>
                    {group.title}
                  </TableCell>
                </TableRow>
                {group.perms.map((perm) => (
                  <TableRow key={perm.value}>
                    <TableCell>{perm.label} <Typography component="span" variant="caption" color="text.secondary">{perm.value}</Typography></TableCell>
                    {EDITABLE_ROLES.map((role) => (
                      <TableCell key={role} align="center">
                        <Checkbox
                          checked={draft[role].includes(perm.value)}
                          onChange={() => toggle(role, perm.value)}
                          disabled={loading}
                          inputProps={{ "aria-label": `${perm.value} for ${role}` }}
                        />
                      </TableCell>
                    ))}
                    <TableCell align="center">
                      <Checkbox checked disabled inputProps={{ "aria-label": `${perm.value} for SUPER_ADMIN (locked)` }} />
                    </TableCell>
                    <TableCell />
                  </TableRow>
                ))}
              </>
            ))}
            <TableRow>
              <TableCell />
              {EDITABLE_ROLES.map((role) => (
                <TableCell key={role} align="center">
                  <Button
                    variant="contained"
                    size="small"
                    disabled={!dirty[role] || saving || loading}
                    onClick={() => save(role)}
                  >
                    Save {role}
                  </Button>
                </TableCell>
              ))}
              <TableCell />
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </Paper>
      {loading && (
        <Typography variant="body2" color="text.secondary" mt={2}>Loading permissions…</Typography>
      )}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity} variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
```

Note: the `<>` fragment inside `TableBody` mapping needs a `key` — the outer fragment uses `<>` with the inner `TableRow key={group.title}`. React requires keys on fragments in lists; replace `<>`/`</>` with `<Fragment key={group.title}>` and import `Fragment` from react. Apply this correction when writing the file (the `TableRow key` alone is not enough for the fragment).

- [ ] **Step 2: Register the route in `App.tsx`**

Add import after line 26 (`SuperAdminAuditLog`):

```ts
import SuperAdminRoles from "./pages/SuperAdminRoles";
```

Add route after line 59 (`/super-admin/audit-log`):

```tsx
<Route path="/super-admin/roles" element={<RequireSuperAdmin><SuperAdminRoles /></RequireSuperAdmin>} />
```

- [ ] **Step 3: Add the sidebar entry in `Layout.tsx`**

Add import after line 37 (`PeopleIcon`):

```ts
import SecurityIcon from "@mui/icons-material/Security";
```

In `secondaryNav` (lines 56-65), after the Audit Log entry (line 62), add:

```ts
{ label: "Roles", icon: <SecurityIcon />, path: "/super-admin/roles", superOnly: true },
```

The existing `visibleSecondaryNav` filter already shows `superOnly` items only to super-admins and hides all admin pages from super-admins except notifications/profile — wait, re-check lines 70-76: `if (isSuperAdmin) return item.path === "/notifications" || item.path === "/profile"`. That second rule would HIDE the new Roles entry (and Dashboard/Users/Audit Log) from super-admins! Look again:

```ts
const visibleSecondaryNav = secondaryNav.filter((item) => {
  if (item.superOnly) return isSuperAdmin;
  if (isSuperAdmin) return item.path === "/notifications" || item.path === "/profile";
  ...
```

The `superOnly` check comes FIRST and returns early, so superOnly items (Dashboard, Users, Audit Log, and now Roles) ARE shown to super-admins. Non-superOnly items are hidden from super-admins except notifications/profile. No filter change needed — the new entry works with the existing logic. Do not touch the filter.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/SuperAdminRoles.tsx frontend/src/App.tsx frontend/src/components/Layout.tsx
git commit -m "feat: super-admin roles and access page"
```

---

### Task 9: Live scopes in `AuthContext`

**Files:**
- Modify: `frontend/src/context/AuthContext.tsx`

`can()` prefers live scopes from the server and falls back to the hardcoded role mirror only when scopes are absent (e.g. a session stored before this change). `hasRole`/`isAdmin`/`isSuperAdmin` keep using `user.role` — unchanged.

- [ ] **Step 1: Apply the edit**

Add `scopes: string[]` to `AuthContextType` (after `can` at line 20):

```ts
scopes: string[];
```

Add state after `accessToken` (line 39):

```ts
const [scopes, setScopes] = useState<string[]>(() => {
  try {
    return JSON.parse(localStorage.getItem("scopes") ?? "[]") as string[];
  } catch {
    return [];
  }
});
```

In `completeLogin` (lines 55-65), after `localStorage.setItem("user", ...)` add:

```ts
setScopes(data.completeLogin.scopes ?? []);
localStorage.setItem("scopes", JSON.stringify(data.completeLogin.scopes ?? []));
```

In `logout` (lines 67-78), after `localStorage.removeItem("user");` add:

```ts
localStorage.removeItem("scopes");
```

and before `await client.resetStore();` add `setScopes([]);`.

In `refreshSession` (lines 80-94), after `localStorage.setItem("refreshToken", data.refreshToken.refreshToken);` add:

```ts
if (data.refreshToken.scopes) {
  setScopes(data.refreshToken.scopes);
  localStorage.setItem("scopes", JSON.stringify(data.refreshToken.scopes));
}
```

Replace the `can` line (line 106):

```ts
can: (perm: string) => hasPermission(user?.role, perm as Permission),
```

with:

```ts
can: (perm: string) =>
  scopes.length > 0 ? scopes.includes(perm) : hasPermission(user?.role, perm as Permission),
```

Add `scopes` to the `value` memo (lines 100-108). Change:

```tsx
  const value = useMemo(() => ({
    user, accessToken,
```

to:

```tsx
  const value = useMemo(() => ({
    user, accessToken, scopes,
```

and change the dependency array:

```tsx
  }), [user, accessToken, login, completeLogin, logout, refreshSession, ensureFreshToken]);
```

to:

```tsx
  }), [user, accessToken, scopes, login, completeLogin, logout, refreshSession, ensureFreshToken]);
```

Also add `scopes,` to the `AuthContextType` interface next to `can` (done above) so consumers can read raw scopes if needed.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/context/AuthContext.tsx
git commit -m "feat: auth context prefers live server scopes"
```

(Type errors, if any, are caught by the build in Task 10.)

---

### Task 10: Full verification + demo deploy

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend suite**

Run: `cd backend && ./.venv/bin/python -m pytest`
Expected: PASS, 95 tests (88 existing including 2 converted + 7 new). If failures, fix before proceeding.

- [ ] **Step 2: Build the frontend**

Run: `cd frontend && npm run build`
Expected: `tsc --noEmit` passes (strict, `noUnusedLocals`) and `vite build` outputs `dist/`.

- [ ] **Step 3: Restart backend and rebuild frontend (PM2 deploy)**

Run: `pm2 restart ccash-backend` (workdir: repo root), then `npm run build` (workdir: `frontend`), then `pm2 restart ccash-frontend` (workdir: repo root) — three separate commands, no `cd` chaining.
Expected: both processes `online` in `pm2 list`; spot-check `pm2 logs ccash-backend --lines 20` for no startup errors.

- [ ] **Step 4: Manual end-to-end check as `superadmin@ccash.ph`**

1. Log in at http://localhost:8830/ as `superadmin@ccash.ph`.
2. Sidebar shows Roles; open `/super-admin/roles` — matrix loads with ADMIN column fully checked, MEMBER/MERCHANT empty.
3. Grant MEMBER `users:read`, Save — snackbar confirms; reload — checkbox persists.
4. As `alice@ccash.ph` (member), log in again (fresh login picks up new scopes); as `admin@ccash.ph`, remove `users:read` from ADMIN, save, re-login as admin — `/admin` redirects to `/` (guard enforced by live scopes).
5. Restore ADMIN grants afterwards so the demo seed state is intact.
6. Direct navigation to `/super-admin/roles` as ADMIN/MEMBER redirects to `/`.

- [ ] **Step 5: Run the realtime check (unchanged behavior)**

Run: `./backend/.venv/bin/python scripts/verify_realtime.py`
Expected: PASS (this change does not touch the WebSocket path, but the pre-demo checklist requires it).

---

## Self-review

**1. Spec coverage:** Data model + seed (Task 1) · service + audit (Task 2) · fallback helper (Task 3) · rejection/validation/revocation (Task 4) · query/mutation super-admin-only (Task 5) · DB scopes at login/refresh + AuthPayload (Task 6) · matrix page at `/super-admin/roles` with grouped rows (Task 8) · RequireSuperAdmin + nav (Task 8) · live scopes in AuthContext (Task 9) · pytest cases 1-7 adapted (Tasks 2/4; seed-row assertion replaced by fallback-contract + manual seed verify in Task 1, because conftest truncation wipes seed rows between tests) · SUPER_ADMIN lock (Tasks 2/4/5/8) · next-login effect (Task 6) · non-goals respected (no roles table, no forced logout, one audit row per update). No gaps.

**2. Placeholder scan:** No TBD/TODO/later; every step has exact code, exact commands, expected output. The one conditional (schema-field assert snippet in Task 5 Step 2) tells the worker exactly what to do if the assumption is wrong.

**3. Type consistency:** `RolePermissionService.set_role_permissions(role: UserRole, permissions: list[str], actor_id: UUID, actor_role: UserRole | None) -> list[str]` — identical signature in definition (Task 2), tests (Tasks 2/4), and resolver call with `UserRole(role.value)`, `info.context.user_id`, `UserRole(info.context.role)` (Task 5). `get_matrix() -> dict[str, list[str]]` matches query builder. `RolePermissionsType{role: str, permissions: list[str]}` matches `GET_ROLE_PERMISSIONS` selection and `RoleRow` in the page. `AuthPayload.scopes: list[str]` backend matches `scopes: string[]` frontend, selected in both auth documents, stored/consumed in AuthContext. `updateRolePermissions(role: UserRoleEnum, permissions: [String!]!) -> [String!]!` matches mutation document variables and page call. Fixed.
