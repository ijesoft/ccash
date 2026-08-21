# RBAC: Admin-Only Cash In/Out & Role Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store user roles in the database (USER/ADMIN), derive JWT scopes from them, make cash in/out and all admin APIs truly admin-only, add an audited `updateUserRole` mutation with a last-admin guardrail, and hide cash in/out from non-admins in the frontend.

**Architecture:** One enum column on `users` + Alembic migration 005; auth service derives scopes at login/refresh; a shared `require_admin` guard in `app/graphql/middleware.py` protects the `cash_in`/`cash_out` mutations, the admin domain, and the KYC approve/reject mutations; role changes are written to the existing (currently unused) `audit_logs` table. Frontend reads `role` from the stored user object, hides UI entry points for non-admins, and wraps `/cash-in`/`/cash-out` in a new `AdminRoute`.

**Tech Stack:** Python 3.13 / FastAPI / Strawberry GraphQL / SQLModel / Alembic / pytest (async) — React 19 / MUI / react-router-dom v6 / strict TypeScript.

## Global Constraints

Every task's requirements implicitly include this section.

- **Test runner on this machine:** there is NO local `backend/.venv` and the host Python is 3.14 (project targets 3.13). All pytest/alembic commands run in a one-off container from the existing backend image with the repo mounted. Run from `/home/joeysabusido/ccash/backend`:

  ```bash
  docker run --rm --network ccash_ccash-net \
    -v "$PWD":/app \
    -e DATABASE_URL="postgresql+asyncpg://ccash:ccash_secret_2024@postgres:5432/ccash_test" \
    -e REDIS_URL="redis://redis:6379/0" \
    -e RABBITMQ_URL="amqp://ccash:ccash_secret_2024@rabbitmq:5672/" \
    -e JWT_SECRET_KEY="test-secret-key-rbac" \
    ccash-backend python -m pytest <paths> -v
  ```

  Tests hit a real PostgreSQL (`ccash_test`, auto-created + Alembic-migrated by `tests/conftest.py`, truncated between tests). The conftest TRUNCATE already includes `audit_logs`.
- **Alembic parity rule (AGENTS.md):** the schema has two sources of truth — `create_tables()` and migrations. Any model change requires the migration AND a re-verified parity diff (Task 6, Step 3).
- **Services must call `session.commit()` explicitly** — flush alone is rolled back when the session closes (AGENTS.md).
- **Strawberry enums must inherit from `enum.Enum`** (or `str, enum.Enum`) — plain classes break schema generation (AGENTS.md).
- **Frontend strict TS:** `noUnusedLocals`, `noUnusedParameters` enforced; verify with `cd frontend && npm run build` (runs `tsc --noEmit && vite build`).
- **Deployment on this machine is the full `docker-compose.yml` stack** behind nginx on port 80 (NOT the PM2 setup in AGENTS.md). Rebuild: `docker compose up -d --build backend frontend` from repo root.
- Money fields, transaction service logic, and idempotency behavior are **unchanged** by this plan.

---

### Task 1: UserRole model field + migration 005 + seed

**Files:**
- Modify: `backend/app/domains/auth/models.py`
- Create: `backend/migrations/versions/005_add_user_role.py`
- Modify: `backend/app/seed.py`

**Interfaces:**
- Consumes: existing `User` model, Alembic head `004`.
- Produces: `UserRole(str, enum.Enum)` with members `USER`, `ADMIN`; `User.role: UserRole` (default `UserRole.USER`). Later tasks rely on `UserRole.ADMIN` and the DB column.

- [ ] **Step 1: Add the enum and column to the model**

In `backend/app/domains/auth/models.py`, add after the `KycLevel` class (line 18):

```python
class UserRole(str, enum.Enum):
    USER = "USER"
    ADMIN = "ADMIN"
```

And on the `User` model, add after the `kyc_level` field (line 31):

```python
    role: UserRole = Field(default=UserRole.USER, sa_type=Enum(UserRole))
```

(`enum`, `Field`, `Enum` are already imported in this file.)

- [ ] **Step 2: Write migration 005**

Create `backend/migrations/versions/005_add_user_role.py`:

```python
"""add role column to users (RBAC)

Revision ID: 005
Revises: 004
Create Date: 2026-08-19

The seed (app/seed.py) defines admin@ccash.ph as the platform admin, so the
data step promotes that email. On fresh installs the column default handles it.

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "role",
            sa.Enum("USER", "ADMIN", name="userrole"),
            nullable=False,
            server_default="USER",
        ),
    )
    op.execute(
        "UPDATE users SET role = 'ADMIN' WHERE email = 'admin@ccash.ph' AND deleted_at IS NULL"
    )


def downgrade() -> None:
    op.drop_column("users", "role")
```

- [ ] **Step 3: Update the seed**

In `backend/app/seed.py`, change the import (line 8):

```python
from app.domains.auth.models import User, UserRole, UserStatus
```

And add `role=UserRole.ADMIN` to the admin user constructor (after `is_verified=True`, line 25):

```python
        admin = User(
            id=uuid.uuid4(),
            email="admin@ccash.ph",
            phone="09180000001",
            first_name="Admin",
            last_name="User",
            password_hash=hash_password("Admin123!"),
            status=UserStatus.ACTIVE,
            is_verified=True,
            role=UserRole.ADMIN,
        )
```

- [ ] **Step 4: Verify the migration applies and models load**

Run (from `/home/joeysabusido/ccash/backend`):

```bash
docker run --rm --network ccash_ccash-net \
  -v "$PWD":/app \
  -e DATABASE_URL="postgresql+asyncpg://ccash:ccash_secret_2024@postgres:5432/ccash_test" \
  -e REDIS_URL="redis://redis:6379/0" \
  -e RABBITMQ_URL="amqp://ccash:ccash_secret_2024@rabbitmq:5672/" \
  -e JWT_SECRET_KEY="test-secret-key-rbac" \
  ccash-backend python -c "
import asyncio, uuid
from sqlalchemy import text
from app.database import async_session_factory, create_tables, close_db
async def main():
    await create_tables()
    async with async_session_factory() as s:
        u = (await s.execute(text('SELECT column_name, column_default FROM information_schema.columns WHERE table_name=:t AND column_name=:c'), {'t':'users','c':'role'})).one()
        print('column:', u)
        await s.rollback()
    await close_db()
asyncio.run(main())
"
```

Expected: `column: ('role', 'USER'::userrole)` — the column exists with default `USER`. (This exercises `create_tables()` against a scratch DB; it does NOT apply the Alembic migration yet — Task 6 runs the full parity check.)

- [ ] **Step 5: Commit**

```bash
git add backend/app/domains/auth/models.py backend/migrations/versions/005_add_user_role.py backend/app/seed.py
git commit -m "feat(rbac): add UserRole column, migration 005, seed admin role"
```

---

### Task 2: Derive JWT scopes from user role at login and refresh

**Files:**
- Modify: `backend/app/domains/auth/service.py` (imports line 19; `login()` line 145; `refresh_token()` lines 158-174)
- Test: `backend/tests/test_rbac.py` (create)

**Interfaces:**
- Consumes: `UserRole` from Task 1; existing `create_access_token(user_id, scopes)` / `decode_token(token)` in `app/core/security.py`; `UserRepository.get_by_id(uuid.UUID) -> User | None`.
- Produces: module-level `_scopes_for(user: User) -> list[str]` (base `["wallet:read", "wallet:write"]`, plus `"admin"` for ADMIN); `AuthService._load_user_or_raise(user_id: str) -> User` (raises `AuthenticationError`). Both are used by Task 3's tests and by login/refresh internally.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_rbac.py`:

```python
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

    admin = User(password_hash="x", role=UserRole.ADMIN)
    assert _scopes_for(admin) == ["wallet:read", "wallet:write", "admin"]


def test_scopes_for_regular_user_has_no_admin():
    from app.domains.auth.service import _scopes_for

    user = User(password_hash="x")  # column default USER
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `/home/joeysabusido/ccash/backend`): the Global Constraints container command with `<paths>` = `tests/test_rbac.py`.
Expected: FAIL — `ImportError` / `cannot import name '_scopes_for'` (and `_load_user_or_raise` missing). The token roundtrip test may already pass; that's fine, it pins existing behavior.

- [ ] **Step 3: Implement**

In `backend/app/domains/auth/service.py`:

1. Change the model import (line 19):

```python
from app.domains.auth.models import User, UserRole, UserStatus
```

2. Add a module-level function after the imports (before `class AuthService`):

```python
def _scopes_for(user: User) -> list[str]:
    scopes = ["wallet:read", "wallet:write"]
    if user.role == UserRole.ADMIN:
        scopes.append("admin")
    return scopes
```

3. In `login()` replace line 145:

```python
        access_token = create_access_token(str(user.id), scopes=_scopes_for(user))
```

4. In `refresh_token()`, after `user_id = payload.get("sub")` (line 163) insert:

```python
        user = await self._load_user_or_raise(user_id)
```

and replace line 170:

```python
        new_access = create_access_token(user_id, scopes=_scopes_for(user))
```

5. Add the method to `AuthService` (e.g., right after `refresh_token`):

```python
    async def _load_user_or_raise(self, user_id: str) -> User:
        try:
            uid = uuid.UUID(user_id)
        except (ValueError, TypeError):
            raise AuthenticationError("Invalid refresh token")
        user = await self.repo.get_by_id(uid)
        if not user:
            raise AuthenticationError("Invalid refresh token")
        return user
```

- [ ] **Step 4: Run tests to verify they pass**

Run: the Global Constraints container command with `<paths>` = `tests/test_rbac.py`.
Expected: all 7 PASS.

- [ ] **Step 5: Run the full suite (no regressions)**

Run: the Global Constraints container command with `<paths>` omitted (runs all tests).
Expected: all pass (51 existing + 7 new = 58).

- [ ] **Step 6: Commit**

```bash
git add backend/app/domains/auth/service.py backend/tests/test_rbac.py
git commit -m "feat(rbac): derive JWT scopes from user role at login and refresh"
```

---

### Task 3: Shared require_admin; gate cash_in/cash_out and admin APIs

**Files:**
- Modify: `backend/app/graphql/middleware.py` (append)
- Modify: `backend/app/domains/admin/graphql.py:24-27` (delete local guard, import shared)
- Modify: `backend/app/domains/users/graphql.py` (two inline checks → shared guard; add import)
- Modify: `backend/app/domains/transactions/graphql.py:19,256,271` (import + first-line guards on cash_in/cash_out)
- Test: `backend/tests/test_rbac.py` (append)

**Interfaces:**
- Consumes: `AuthContext` (`app/graphql/middleware.py`, fields `user_id: uuid.UUID | None`, `scopes: list[str]`).
- Produces: `require_admin(context: AuthContext) -> None` — raises `Exception("Not authorized")` for anonymous or non-admin contexts. Imported by the admin, users, and transactions domains.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_rbac.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: Global Constraints container command, `<paths>` = `tests/test_rbac.py -k require_admin`.
Expected: FAIL — `ImportError: cannot import name 'require_admin'`.

- [ ] **Step 3: Implement the shared guard**

Append to `backend/app/graphql/middleware.py`:

```python
def require_admin(context: AuthContext) -> None:
    """Raise for any context that is not an authenticated admin.

    Single home for the admin check; every domain imports this instead of
    inlining it, so the guard cannot drift between resolvers.
    """
    if not context.user_id or "admin" not in context.scopes:
        raise Exception("Not authorized")
```

- [ ] **Step 4: Point the admin domain at the shared guard**

In `backend/app/domains/admin/graphql.py`, delete the local definition (lines 24-27):

```python
def require_admin(context):
    if not context.user_id or "admin" not in context.scopes:
        raise Exception("Not authorized")
```

and add to the imports (top of file):

```python
from app.graphql.middleware import require_admin
```

- [ ] **Step 5: Point the users domain at the shared guard**

In `backend/app/domains/users/graphql.py`, add to the imports:

```python
from app.graphql.middleware import require_admin
```

In `approve_kyc` (lines 74-78), KEEP `context = info.context` — the method body still uses
`context.user_id` in the service call — and replace only the inline check:

```python
    @strawberry.mutation
    async def approve_kyc(self, info: Info, document_id: str) -> bool:
        context = info.context
        require_admin(context)

        service = await get_kyc_service(info)
```

Do the same in `reject_kyc` (lines 86-90): replace

```python
        context = info.context
        if not context.user_id or "admin" not in context.scopes:
            raise Exception("Not authorized")
```

with

```python
        context = info.context
        require_admin(context)
```

(Both methods keep their existing `service = await get_kyc_service(info)` line and body unchanged.)

- [ ] **Step 6: Gate cash_in and cash_out**

In `backend/app/domains/transactions/graphql.py`:

1. Extend the middleware import (line 19):

```python
from app.graphql.middleware import AuthContext, require_admin
```

2. In `cash_in` (line 256), insert the guard after `user_id = require_user(info)`:

```python
    @strawberry.mutation
    async def cash_in(self, info: Info, input: CashInInput) -> TransactionType:
        user_id = require_user(info)
        require_admin(info.context)

        service = await get_tx_service(info)
```

3. In `cash_out` (line 271), the identical insertion after `user_id = require_user(info)`:

```python
    @strawberry.mutation
    async def cash_out(self, info: Info, input: CashOutInput) -> TransactionType:
        user_id = require_user(info)
        require_admin(info.context)

        service = await get_tx_service(info)
```

No other mutation changes — `send_money`, QR, and request-money stay available to all users.

- [ ] **Step 7: Run tests to verify they pass**

Run: Global Constraints container command with no path filter (full suite).
Expected: all pass (61 total). The existing transaction tests call the *service* layer directly, so resolver-level gating does not affect them.

- [ ] **Step 8: Commit**

```bash
git add backend/app/graphql/middleware.py backend/app/domains/admin/graphql.py backend/app/domains/users/graphql.py backend/app/domains/transactions/graphql.py backend/tests/test_rbac.py
git commit -m "feat(rbac): shared require_admin; cash_in/cash_out now admin-only"
```

---

### Task 4: updateUserRole mutation with audit trail and last-admin guardrail

**Files:**
- Modify: `backend/app/domains/admin/service.py` (imports + new method)
- Modify: `backend/app/domains/admin/graphql.py` (new enum + mutation field on `AdminMutations`)
- Test: `backend/tests/test_rbac.py` (append)

**Interfaces:**
- Consumes: `UserRole` (Task 1), `AuditLog` (`app/core/audit.py`: fields `user_id`, `action`, `resource_type`, `resource_id`, `old_values`, `new_values`), `UserRepository.get_by_id` / `.update`, `NotFoundError` / `ValidationError` from `app/core/errors.py`.
- Produces: `AdminService.update_user_role(user_id: uuid.UUID, new_role: UserRole, actor_id: uuid.UUID) -> User` (raises `NotFoundError` / `ValidationError`; writes an audit row; commits); GraphQL mutation `updateUserRole(userId: String!, role: UserRoleEnum!) → User | None`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_rbac.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: Global Constraints container command, `<paths>` = `tests/test_rbac.py -k update_user_role`.
Expected: FAIL — `AdminService` has no attribute `update_user_role`.

- [ ] **Step 3: Implement the service method**

In `backend/app/domains/admin/service.py`, extend the imports:

```python
from app.core.audit import AuditLog
from app.core.errors import NotFoundError, ValidationError
from app.domains.auth.models import User, UserRole
```

Add the method to `AdminService` (after `activate_user`):

```python
    async def update_user_role(
        self, user_id: uuid.UUID, new_role: UserRole, actor_id: uuid.UUID
    ) -> User:
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User not found")

        # Lockout prevention: never allow the organization's last admin to be
        # demoted. SUSPENDED admins still count — they can be reactivated.
        if user.role == UserRole.ADMIN and new_role != UserRole.ADMIN:
            other_admins = (
                await self.session.execute(
                    select(func.count(User.id)).where(
                        User.role == UserRole.ADMIN,
                        User.deleted_at.is_(None),
                        User.id != user_id,
                    )
                )
            ).scalar() or 0
            if other_admins == 0:
                raise ValidationError("Cannot demote the last admin")

        old_role = user.role.value
        user.role = new_role
        user.updated_by = actor_id
        self.session.add(
            AuditLog(
                user_id=actor_id,
                action="role.change",
                resource_type="user",
                resource_id=str(user_id),
                old_values={"role": old_role},
                new_values={"role": new_role.value},
            )
        )
        await self.user_repo.update(user)
        await self.session.commit()
        return user
```

(`func` and `select` are already imported in this file.)

- [ ] **Step 4: Expose the GraphQL mutation**

In `backend/app/domains/admin/graphql.py`, extend imports at top of file:

```python
import enum

from app.core.errors import NotFoundError, ValidationError
from app.domains.auth.models import UserRole
from app.graphql.middleware import require_admin
```

Add the Strawberry enum after the existing imports (before `PlatformStats`):

```python
@strawberry.enum
class UserRoleEnum(str, enum.Enum):
    USER = "USER"
    ADMIN = "ADMIN"
```

Add the mutation field to `AdminMutations` (after `activate_user`):

```python
    @strawberry.mutation
    async def update_user_role(
        self, info: Info, user_id: str, role: UserRoleEnum
    ) -> UserType | None:
        require_admin(info.context)
        service = await get_admin_service(info)
        try:
            user = await service.update_user_role(
                uuid.UUID(user_id), UserRole(role.value), info.context.user_id
            )
            return UserType.from_model(user) if user else None
        except (NotFoundError, ValidationError) as e:
            raise Exception(str(e))
        finally:
            await service.session.close()
```

The root schema already aggregates `AdminMutations` (`app/graphql/schema.py` line 17), so the mutation is exposed automatically.

- [ ] **Step 5: Run tests to verify they pass**

Run: Global Constraints container command, `<paths>` = `tests/test_rbac.py`.
Expected: all pass (16 in this file).

- [ ] **Step 6: Run the full suite**

Run: Global Constraints container command, no path filter.
Expected: all pass (66 total).

- [ ] **Step 7: Commit**

```bash
git add backend/app/domains/admin/service.py backend/app/domains/admin/graphql.py backend/tests/test_rbac.py
git commit -m "feat(rbac): updateUserRole mutation with audit trail and last-admin guard"
```

---

### Task 5: Frontend — role-aware gating of cash in/out

**Files:**
- Modify: `frontend/src/types/index.ts:1-12`
- Modify: `frontend/src/context/AuthContext.tsx` (interface + value)
- Modify: `frontend/src/pages/Dashboard.tsx`
- Modify: `frontend/src/components/Layout.tsx`
- Create: `frontend/src/components/AdminRoute.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: backend `UserType.role` (present on every login payload and in the localStorage `user` object from Task 1 onward).
- Produces: `useAuth().isAdmin: boolean`; `<AdminRoute>` wrapper. The CashIn/CashOut pages themselves are unchanged.

- [ ] **Step 1: Add role to the User type**

In `frontend/src/types/index.ts`, inside `interface User` (after `status: string;`):

```ts
  role: string;
```

- [ ] **Step 2: Expose isAdmin from AuthContext**

In `frontend/src/context/AuthContext.tsx`:

1. Add to the interface:

```ts
interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (email: string, password: string, otpCode?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
}
```

2. In the `value` useMemo, add `isAdmin`:

```ts
  const value = useMemo(() => ({
    user,
    accessToken,
    isAuthenticated: !!user && !!accessToken,
    isAdmin: user?.role === "ADMIN",
    login,
    logout,
    refreshSession,
  }), [user, accessToken, login, logout, refreshSession]);
```

- [ ] **Step 3: Gate the dashboard**

In `frontend/src/pages/Dashboard.tsx`:

1. Rename the module-level array and mark admin-only paths (replace lines 21-26):

```tsx
const allActions = [
  { label: "Send", path: "/send", icon: <SendIcon />, color: "#0f6ecd", bg: "#e3f0fc" },
  { label: "Cash In", path: "/cash-in", icon: <CallReceivedIcon />, color: "#00b894", bg: "#e0faf3" },
  { label: "Cash Out", path: "/cash-out", icon: <CallMadeIcon />, color: "#e74c3c", bg: "#fde8e8" },
  { label: "QR Pay", path: "/qr-payment", icon: <QrCodeIcon />, color: "#6c5ce7", bg: "#eee8ff" },
];

const ADMIN_ONLY_PATHS = ["/cash-in", "/cash-out"];
```

2. Inside the component, after `const { user } = useAuth();` (line 31), derive role and visible actions:

```tsx
  const { user, isAdmin } = useAuth();
  ...
  const actions = isAdmin ? allActions : allActions.filter((a) => !ADMIN_ONLY_PATHS.includes(a.path));
```

(replace the existing `const { user } = useAuth();` line with the destructuring above; keep `greetingName` as-is).

3. Loading skeleton grid (lines 41-44): drive it by visible actions so the placeholder matches the real layout:

```tsx
        <Box sx={{ display: "grid", gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))`, gap: 1.5, mb: 3 }}>
          {Array.from({ length: actions.length }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={88} sx={{ borderRadius: 3 }} />
          ))}
        </Box>
```

4. Actions grid (line 88): make the column count dynamic:

```tsx
            gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))`,
```

5. Empty-state button (lines 169-171) — point non-admins at Send:

```tsx
              <Button variant="outlined" size="small" sx={{ mt: 2 }} onClick={() => navigate(isAdmin ? "/cash-in" : "/send")}>
                {isAdmin ? "Cash in to get started" : "Send money to get started"}
              </Button>
```

- [ ] **Step 4: Gate the sidebar**

In `frontend/src/components/Layout.tsx`, inside the component after `const theme = useTheme();` (line 59):

```tsx
  const { user, isAdmin, logout } = useAuth();
  const visibleSecondaryNav = isAdmin ? secondaryNav : secondaryNav.filter(
    (item) => item.path !== "/cash-in" && item.path !== "/cash-out",
  );
```

(replaces the existing `const { user, logout } = useAuth();` line), and change the render loop (line 132) from `{secondaryNav.map((item) => (` to `{visibleSecondaryNav.map((item) => (`. The module-level `secondaryNav` const stays as-is.

- [ ] **Step 5: Create AdminRoute**

Create `frontend/src/components/AdminRoute.tsx`:

```tsx
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}
```

- [ ] **Step 6: Wrap the cash routes**

In `frontend/src/App.tsx`, add the import (after the ProtectedRoute import, line 7):

```tsx
import AdminRoute from "./components/AdminRoute";
```

and wrap the two routes (lines 39-40):

```tsx
                <Route path="/cash-in" element={<AdminRoute><CashIn /></AdminRoute>} />
                <Route path="/cash-out" element={<AdminRoute><CashOut /></AdminRoute>} />
```

- [ ] **Step 7: Verify the strict build**

Run (from `/home/joeysabusido/ccash/frontend`):

```bash
npm run build
```

Expected: `tsc --noEmit` clean (no unused-import or type errors) and a successful Vite build. This is the gate — strict TS with `noUnusedLocals` catches anything missed.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/context/AuthContext.tsx frontend/src/pages/Dashboard.tsx frontend/src/components/Layout.tsx frontend/src/components/AdminRoute.tsx frontend/src/App.tsx
git commit -m "feat(frontend): hide cash in/out from non-admins; admin route guard"
```

---

### Task 6: Migrate, deploy, and verify end-to-end

**Files:**
- Modify: `AGENTS.md` (deployment/test-user/convention notes)

**Interfaces:**
- Consumes: everything from Tasks 1-5.
- Produces: a running, verified deployment + updated agent docs.

- [ ] **Step 1: Full test suite**

Run (from `/home/joeysabusido/ccash/backend`): the Global Constraints container command with no path filter.
Expected: all 66 tests pass.

- [ ] **Step 2: Alembic migration on a scratch DB + parity check (AGENTS.md rule)**

```bash
cd /home/joeysabusido/ccash/backend

# Scratch DB built by Alembic
docker exec ccash-postgres createdb -U ccash ccash_parity_alembic
docker run --rm --network ccash_ccash-net \
  -v "$PWD":/app \
  -e DATABASE_URL="postgresql+asyncpg://ccash:ccash_secret_2024@postgres:5432/ccash_parity_alembic" \
  -e REDIS_URL="redis://redis:6379/0" \
  -e RABBITMQ_URL="amqp://ccash:ccash_secret_2024@rabbitmq:5672/" \
  -e JWT_SECRET_KEY="parity-check" \
  ccash-backend python -m alembic -c migrations/alembic.ini upgrade head

# Scratch DB built by create_tables()
docker exec ccash-postgres createdb -U ccash ccash_parity_createall
docker run --rm --network ccash_ccash-net \
  -v "$PWD":/app \
  -e DATABASE_URL="postgresql+asyncpg://ccash:ccash_secret_2024@postgres:5432/ccash_parity_createall" \
  -e REDIS_URL="redis://redis:6379/0" \
  -e RABBITMQ_URL="amqp://ccash:ccash_secret_2024@rabbitmq:5672/" \
  -e JWT_SECRET_KEY="parity-check" \
  ccash-backend python -c "
import asyncio
# create_tables() only sees models that have been imported — register all of them:
import app.core.audit, app.domains.auth.models, app.domains.users.models
import app.domains.wallets.models, app.domains.notifications.models, app.domains.transactions.models
from app.database import create_tables, close_db
asyncio.run(create_tables())
asyncio.run(close_db())
print('create_all done')
"

# Diff normalized schemas — expect EMPTY output
dump() { docker exec ccash-postgres psql -U ccash -d "$1" -Atc "SELECT table_name || '.' || column_name || ' ' || data_type FROM information_schema.columns WHERE table_schema = 'public' ORDER BY 1"; }
diff <(dump ccash_parity_alembic) <(dump ccash_parity_createall)

# Clean up
docker exec ccash-postgres dropdb -U ccash --if-exists ccash_parity_alembic
docker exec ccash-postgres dropdb -U ccash --if-exists ccash_parity_createall
```

Expected: `upgrade head` completes; the `diff` prints nothing (schemas in sync). If the diff is non-empty, STOP and reconcile model vs migration before continuing.

- [ ] **Step 3: Migrate the dev database**

```bash
cd /home/joeysabusido/ccash/backend
docker run --rm --network ccash_ccash-net \
  -v "$PWD":/app \
  -e DATABASE_URL="postgresql+asyncpg://ccash:ccash_secret_2024@postgres:5432/ccash" \
  -e REDIS_URL="redis://redis:6379/0" \
  -e RABBITMQ_URL="amqp://ccash:ccash_secret_2024@rabbitmq:5672/" \
  -e JWT_SECRET_KEY="parity-check" \
  ccash-backend python -m alembic -c migrations/alembic.ini upgrade head

docker exec ccash-postgres psql -U ccash -d ccash -c "SELECT email, role FROM users ORDER BY created_at;"
```

Expected: `admin@ccash.ph` → `ADMIN`; every other row → `USER`. (Migrate BEFORE restarting the backend — `create_tables()` at startup does not add columns to existing tables.)

- [ ] **Step 4: Rebuild and restart the stack**

Run (from `/home/joeysabusido/ccash`):

```bash
docker compose up -d --build backend frontend
docker logs ccash-backend --tail 20
```

Expected: `Application startup complete.` and no errors.

- [ ] **Step 5: GraphQL smoke tests via nginx**

```bash
login() { curl -s http://localhost/api/graphql -X POST -H 'Content-Type: application/json' \
  -d "{\"query\":\"mutation { login(email: \\\"$1\\\", password: \\\"$2\\\") { accessToken user { role } } }\"}"; }

ALICE=$(login alice@ccash.ph 'Alice123!')
ADMIN=$(login admin@ccash.ph 'Admin123!')
echo "$ALICE"   # expect "role":"USER"
echo "$ADMIN"   # expect "role":"ADMIN"
```

Extract the two `accessToken` values (e.g. with `jq -r '.data.login.accessToken'`) into `A_TOKEN` and `AD_TOKEN`, then:

```bash
# 1. Non-admin cashIn must be refused
curl -s http://localhost/api/graphql -X POST -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $A_TOKEN" \
  -d '{"query":"mutation { cashIn(input: {amountCents: 1000, idempotencyKey: \"rbac-smoke-1\"}) { id } }"}'
# expect: errors[0].message == "Not authorized"

# 2. Non-admin role change must be refused
curl -s http://localhost/api/graphql -X POST -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $A_TOKEN" \
  -d '{"query":"mutation { updateUserRole(userId: \"<any-user-uuid>\", role: ADMIN) { id } }"}'
# expect: errors[0].message == "Not authorized"

# 3. Admin cashIn works (then cashOut the same amount back out to keep balances clean)
curl -s http://localhost/api/graphql -X POST -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $AD_TOKEN" \
  -d '{"query":"mutation { cashIn(input: {amountCents: 1000, idempotencyKey: \"rbac-smoke-2\"}) { id } }"}'
# expect: data.cashIn.id

# 4. Admin can promote + demote alice (round trip ends at USER)
# First get alice's id as alice herself:
curl -s http://localhost/api/graphql -X POST -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $A_TOKEN" -d '{"query":"{ me { id role } }"}'
# then, as admin:
#   updateUserRole(userId: "<alice-id>", role: ADMIN)  -> role "ADMIN"
#   updateUserRole(userId: "<alice-id>", role: USER)   -> role "USER"

# 5. Last-admin guardrail: demoting the only admin fails
curl -s http://localhost/api/graphql -X POST -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $AD_TOKEN" \
  -d '{"query":"mutation { updateUserRole(userId: \"<admin-id>\", role: USER) { id } }"}'
# expect: errors[0].message == "Cannot demote the last admin"

# 6. Admin APIs now work for a real admin (previously rejected everyone)
curl -s http://localhost/api/graphql -X POST -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $AD_TOKEN" -d '{"query":"{ platformStats { totalUsers } adminUsers(limit: 3) { email role } }"}'
# expect: data, not an error
```

- [ ] **Step 6: Browser verification (manual)**

Log in at http://localhost/ as `alice@ccash.ph` / `Alice123!`:
- Dashboard shows exactly two action tiles: Send and QR Pay.
- Sidebar has no Cash In / Cash Out entries (Notifications, Profile remain).
- Navigating to `/cash-in` redirects to the dashboard.

Log in as `admin@ccash.ph` / `Admin123!`:
- Dashboard shows four tiles including Cash In and Cash Out; sidebar entries present; pages work.

- [ ] **Step 7: Update AGENTS.md**

In `AGENTS.md`, make these three small edits:

1. Test users table — add a Role column (admin = ADMIN, others USER).
2. Key conventions — add one bullet after the idempotency bullet:

```markdown
- **RBAC:** `users.role` is `USER`/`ADMIN` (migration 005). JWTs carry an `admin` scope for
  admins, derived at login AND refresh from the DB (`AuthService._scopes_for`). The single
  admin check lives in `app/graphql/middleware.py::require_admin`; it guards `cashIn`,
  `cashOut`, all admin-domain APIs and KYC approve/reject. Cash in/out is an operator function —
  admin-only by design, hidden from non-admins in the UI (`AdminRoute`). Role changes go through
  `updateUserRole` (audited in `audit_logs`; last active admin cannot be demoted).
```

3. Testing section — note that on this machine there is no local venv and tests run via the one-off container command from the plan (copy the Global Constraints command verbatim).

- [ ] **Step 8: Commit**

```bash
git add AGENTS.md
git commit -m "docs(agents): record RBAC conventions and container test command"
```

---

## Notes for the executor

- **Known pre-existing issue (do NOT fix in this plan):** `AdminService.suspend_user` / `activate_user` flush but never `session.commit()`, so their changes are likely rolled back when the resolver closes the session. Out of scope; flag it to the user after Task 4 if asked about admin APIs.
- **Demoted-admin grace period:** an issued access token keeps its scopes until expiry (≤15 min); refresh re-reads the DB immediately. By design (spec: Non-goals).
- **Frontend role staleness:** a demoted user's browser keeps showing admin UI until next login; their API calls are refused regardless. By design.
- The `ccash-backend` Docker image does not contain `migrations/` — that is why every alembic command mounts the host repo over `/app`.
