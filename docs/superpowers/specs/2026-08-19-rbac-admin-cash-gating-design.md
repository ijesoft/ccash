# RBAC: Admin-Only Cash In/Out & Role Management

**Date:** 2026-08-19
**Status:** Approved (design sign-off in conversation)
**Scope:** Backend + frontend. One DB column, one migration, token-scope wiring, API enforcement, UI gating.

## Problem

The app has no working concept of "admin":

- `User` model has **no role field** — the database cannot distinguish admin from user.
- Every login issues JWT scopes `["wallet:read", "wallet:write"]`; the `"admin"` scope that
  `require_admin()` checks for is **never granted to anyone**, including `admin@ccash.ph`.
  Consequently every existing admin API (`platformStats`, `adminUsers`, `suspendUser`,
  `activateUser`, KYC document endpoints in the users domain) rejects *everyone*.
- The frontend `User` type carries no role, so the UI cannot gate anything by role.

Requirement: implement role-based access control stored in the database. Only admins can
update or view admin data (including roles). Cash In / Cash Out — simulated operator funding
functions — are visible and usable **only by admins**: dashboard tiles, sidebar entries,
routes, and the underlying GraphQL mutations are all gated. Regular users see neither.

## Best-practice basis (payment/e-money patterns)

| Practice | How this design applies it |
|---|---|
| Least privilege / default deny | New users register as `USER`; admin is an explicit grant stored in DB |
| Server-side enforcement; UI hiding is UX, not security | `require_admin` on the mutations themselves; route guards and tile hiding layered on top |
| Role in DB; tokens derive scopes from it — clients never assert their own role | `role` column → JWT scopes computed at login and refresh |
| Short-lived access + revocable refresh (existing: 15 min / 7 days) | Reused. Demoted admin loses power within ≤15 min, immediately at next refresh |
| Separation of duties in e-money: customers don't self-fund; cash-in/out is an operator function (GCash/Maya model) | `cashIn`/`cashOut` become admin-only |
| Audit trail for privileged actions | Wire the existing **unused** `audit_logs` table into role changes (actor, action, resource, old/new values) |
| Lockout prevention | Demoting the last active ADMIN is rejected |
| Extensible without over-engineering | `UserRole` enum now; full roles×permissions schema deferred until a 3rd role or granular permissions appear (YAGNI) |

Note: this is a simulated-funds demo. We apply e-money platform patterns; no PCI DSS claims.

## Non-goals (explicitly out of scope)

- MFA *required* for admin login (TOTP infra exists; forcing it breaks demo logins)
- Session/refresh-token revocation on demotion (needs per-user refresh-token index; the 15-min access TTL already bounds exposure)
- `/admin` back-office UI for managing roles (follow-up ticket; role management works via API this ticket, with audit)
- Full RBAC tables (`roles`, `permissions`, join tables) — two roles don't need a permission matrix
- Any change to cash-in/out *service* logic (amounts, idempotency, notifications all unchanged)

## Design

### A. Role model & DB

`backend/app/domains/auth/models.py`:

```python
class UserRole(str, enum.Enum):
    USER = "USER"
    ADMIN = "ADMIN"
```

New field on `User`, matching the existing `status`/`kyc_level` pattern:

```python
role: UserRole = Field(default=UserRole.USER, sa_type=Enum(UserRole))
```

- **Default deny:** registration (`AuthService.register`) creates users with no role
  argument → column default `USER`.
- **Migration 003** (new file in `backend/migrations/versions/`):
  1. `op.add_column("users", sa.Column("role", sa.Enum("USER", "ADMIN", name="userrole"), nullable=False, server_default="USER"))`
  2. Data step: `UPDATE users SET role = 'ADMIN' WHERE email = 'admin@ccash.ph' AND deleted_at IS NULL`
- **Seed** (`backend/app/seed.py`): admin user constructed with `role=UserRole.ADMIN`;
  alice/bob unchanged (default `USER`). Fresh installs and migrated existing DBs both end up correct.
- Per AGENTS.md convention: after the model + migration change, re-verify parity by diffing a
  `create_all` database against an `alembic upgrade head` database.

### B. Token flow (`backend/app/domains/auth/service.py`)

New private helper:

```python
def _scopes_for(user: User) -> list[str]:
    scopes = ["wallet:read", "wallet:write"]
    if user.role == UserRole.ADMIN:
        scopes.append("admin")
    return scopes
```

- `login()` (currently line 145): replace hardcoded scopes with `_scopes_for(user)`.
- `refresh_token()` (currently line 170): load the user via `self.repo.get_by_id(uuid.UUID(user_id))`;
  if not found → raise `AuthenticationError` (also fixes a latent bug: refresh currently mints
  tokens for deleted/unknown users). Otherwise derive scopes with `_scopes_for(user)`.
- Demotion propagation: an already-issued access token keeps its scopes until expiry (≤15 min);
  the next refresh immediately reflects the new role. Accepted behavior, documented here.

### C. API enforcement

**Shared guard.** Move `require_admin` from `app/domains/admin/graphql.py` into
`app/graphql/middleware.py` (next to `AuthContext`, whose fields it reads):

```python
def require_admin(context: AuthContext) -> None:
    if not context.user_id or "admin" not in context.scopes:
        raise Exception("Not authorized")
```

- `app/domains/admin/graphql.py` and `app/domains/users/graphql.py` (two inline checks at lines
  76/89) import it from the shared location. No behavior change — these now simply work for a
  real admin instead of rejecting everyone.

**Cash in/out gating.** In `app/domains/transactions/graphql.py`, the `cash_in` and `cash_out`
mutations call `require_admin(info.context)` as their first statement. Non-admins get
`Not authorized`. The service layer is untouched (tests exercise it directly; authorization is
the resolver's job, consistent with existing layering).

**Role management mutation.** New field on `AdminMutations` (`app/domains/admin/graphql.py`):

```python
@strawberry.mutation
async def update_user_role(self, info: Info, user_id: str, role: UserRoleInput) -> UserType | None:
    require_admin(info.context)
    ...
```

Semantics (logic lives in `AdminService.update_user_role(user_id, new_role, actor_id)`):

1. Load target user; raise `NotFoundError` if missing or soft-deleted.
2. **Last-admin guardrail:** if the target is currently ADMIN, the new role is not ADMIN, and
   the count of *other non-deleted* ADMIN users (any status) is 0 → raise
   `ValidationError("Cannot demote the last admin")`. A SUSPENDED admin still counts — they can
   be reactivated, so removing them would risk a total lockout.
3. Write `AuditLog` row: `user_id=actor_id`, `action="role.change"`,
   `resource_type="user"`, `resource_id=str(target.id)`,
   `old_values={"role": <old>}`, `new_values={"role": <new>}` (uses the existing
   `app/core/audit.py` model, currently unused).
4. Set target `updated_by = actor_id` (existing column) and commit.
5. Return updated `UserType`.

The GraphQL input for role is a Strawberry enum mirroring `UserRole` (AGENTS.md: enums must
inherit from `enum.Enum`).

### D. Frontend

- `frontend/src/types/index.ts`: add `role: string` to the `User` interface.
  (Login stores the full user in localStorage; role flows through automatically.)
- `frontend/src/context/AuthContext.tsx`: expose derived `isAdmin: boolean`
  (`user?.role === "ADMIN"`) on the context value alongside `isAuthenticated`.
- `frontend/src/pages/Dashboard.tsx`:
  - Quick-action tiles: Cash In and Cash Out entries rendered only when `isAdmin`. The grid's
    column count is driven by the number of visible actions (`repeat(n, minmax(0, 1fr))`):
    admin → 4 columns (Send, Cash In, Cash Out, QR Pay), user → 2 columns (Send, QR Pay).
  - Empty state ("No recent transactions"): admin keeps "Cash in to get started" (`/cash-in`);
    non-admin sees "Send money to get started" (`/send`).
- `frontend/src/components/Layout.tsx`: `secondaryNav` filtered by role — Cash In / Cash Out
  entries removed for non-admins (Notifications and Profile unaffected).
- New `frontend/src/components/AdminRoute.tsx`, mirroring the existing 8-line `ProtectedRoute`
  pattern:

  ```tsx
  export default function AdminRoute({ children }: { children: React.ReactNode }) {
    const { isAdmin } = useAuth();
    if (!isAdmin) return <Navigate to="/" replace />;
    return <>{children}</>;
  }
  ```

- `frontend/src/App.tsx`: wrap the `/cash-in` and `/cash-out` routes in `<AdminRoute>`.
  Direct-URL access by a non-admin redirects to home. The CashIn/CashOut pages themselves are
  unchanged (admin uses them).
- Role changes for a logged-in user take effect at their next login (localStorage user object
  is refreshed on login). Accepted behavior.

### E. Tests

New file `backend/tests/test_rbac.py` (existing conventions: real Postgres via Alembic-migrated
`ccash_test`, `make_account` fixture for users/wallets):

1. **Scope derivation**
   - `AuthService.login` for an ADMIN user → decoded access token contains `"admin"` in scopes;
     wallet scopes present.
   - `AuthService.login` for a USER → no `"admin"` scope.
2. **Refresh**
   - Refresh issued to admin preserves `admin` scope; refresh to regular user doesn't.
   - Refresh with a token whose `sub` is not in the DB → `AuthenticationError`.
3. **updateUserRole (service level)**
   - Admin promotes a USER → role becomes ADMIN, audit row written with correct actor and
     old/new values, `updated_by` set to the admin's id.
   - Demote an ADMIN when another active admin exists → succeeds.
   - Demote the **last non-deleted** ADMIN → `ValidationError`, role unchanged, no audit row.
     (Also covered: a SUSPENDED admin still counts toward the guard.)
   - Unknown `user_id` → `NotFoundError`.
4. **Guard helper** — `require_admin` raises on (no user_id), (user without admin scope), and
   passes for an admin context.

Existing 51 tests must stay green: they call the service layer directly, so resolver-level
enforcement doesn't affect them; the new column default doesn't change their assertions.
conftest's TRUNCATE already lists `audit_logs`.

## Verification (post-implementation)

1. `cd backend && ./.venv/bin/python -m pytest` — all tests pass (51 existing + new RBAC suite).
2. Migration parity check per AGENTS.md: diff `create_all` DB vs `alembic upgrade head` DB.
3. Apply migration to the dev database; confirm `admin@ccash.ph` has `role='ADMIN'`, others `USER`.
4. Rebuild + restart the running Docker stack (this machine runs the full `docker-compose.yml`):
   `docker compose up -d --build backend frontend`, then verify via GraphQL:
   - login as alice → token scopes lack `admin`; call `cashIn` → `Not authorized`;
     `updateUserRole` → `Not authorized`.
   - login as admin → token has `admin`; `cashIn` works; `updateUserRole` promotes/demotes a
     test user (and is blocked for the last admin); `platformStats`/`adminUsers` now return data.
5. Browser check: alice's dashboard shows Send + QR Pay only, sidebar has no Cash In/Out,
   `/cash-in` redirects to home; admin sees all four tiles and both sidebar entries.

## Risks / known limitations

- **≤15 min grace after demotion** (access-token TTL). Mitigation exists by design (refresh
  re-reads DB); full session revocation is a documented non-goal.
- **Migration data step hardcodes `admin@ccash.ph`** — pragmatic for a demo where the seed
  defines admin identity; noted in the migration docstring.
- **Frontend role staleness**: a demoted user keeps UI access until next login (their API calls
  are refused within 15 min regardless).
