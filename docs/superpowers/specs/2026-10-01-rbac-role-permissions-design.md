# RBAC Role-Permissions Management (Super-Admin Only)

**Date:** 2026-10-01
**Status:** Approved (design sign-off in conversation)
**Scope:** Backend + frontend. New `role_permissions` table, one Alembic migration with seed, GraphQL query + mutation, super-admin-only page at `/super-admin/roles` with per-role access matrix.

## Problem

`ROLE_PERMISSIONS` is hardcoded in two places — `backend/app/core/rbac.py` and `frontend/src/rbac.ts` — with `ADMIN = ALL` and `SUPER_ADMIN = ALL` identical. There is no way to change what a role can do without editing code, rebuilding, and redeploying. Requirement: a super-admin-only route and page where per-role access is viewed and set, persisted in the database, enforced by the backend, and reflected in the frontend.

## Decisions (from brainstorming)

- **Storage:** DB-backed. Changes survive restarts without a code change.
- **Editable roles:** MEMBER, MERCHANT, ADMIN. SUPER_ADMIN is locked to all permissions (lockout guard).
- **Effect timing:** Next login / token refresh. Scopes stay baked into the JWT; no per-request DB check, no forced logout.
- **Page layout:** Matrix table — rows are the 19 permissions grouped by domain, columns are MEMBER / MERCHANT / ADMIN with checkboxes.
- **Frontend gating:** Query the backend. `AuthContext.can()` prefers live scopes from the login/`me` payload, falling back to the hardcoded mirror only when scopes are absent.

## Design

### A. Data model & migration

New table `role_permissions` (`role TEXT`, `permission TEXT`, composite PK). One row per granted permission, e.g. `('ADMIN', 'users:read')`. No row means denied. This is a pure mapping table: rows are hard-deleted and re-inserted on each role update (no `deleted_at`/`version` columns — history is covered by the `audit_logs` row written on every update), which avoids PK conflicts on re-grant.

Alembic migration `009_role_permissions.py`: creates the table, then seeds it from the current `ROLE_PERMISSIONS` constants (ADMIN = all 19, SUPER_ADMIN = all 19, MEMBER / MERCHANT = none). The `User` model is unchanged (`role` enum already exists; no new enum values). `create_tables()` model and the migration are kept in sync and re-verified by diffing per repo convention.

`ROLE_PERMISSIONS` in `app/core/rbac.py` stays as the fallback default used when the table has no rows for a role (fresh DB before migration, tests that bypass Alembic). `permissions_for(role)` becomes an async function that reads the DB first and falls back to the constants.

### B. Backend service & GraphQL

New module `backend/app/domains/admin/role_permissions.py` following the domain pattern (`models.py` → `repository.py` → `service.py` → `graphql.py`; service owns the session and calls `session.commit()` explicitly):

- `RolePermission` SQLModel (`role`, `permission` composite PK only — no `deleted_at`/`version`; see section A).
- `RolePermissionService`: `get_matrix()` returns `{role: [permissions]}` for all four roles (SUPER_ADMIN synthesized as all permissions, never read from the table); `set_role_permissions(role, permissions, actor_id)` validates every string against the `Permission` enum, rejects `SUPER_ADMIN`, deletes existing rows for the role and inserts the new set in one transaction, writes one `AuditLog` row (`action='rbac.update'`, `resource_type='role'`, `resource_id=role`, old/new permission lists), then commits.
- `AuthService._scopes_for()` becomes async and awaits the DB-backed `permissions_for()` at login, complete-login, and refresh, preserving the existing `wallet:read/write` base scopes and the legacy `admin` shim.

GraphQL additions in `backend/app/domains/admin/graphql.py` (surfaced through the existing root schema inheritance, no schema-root changes):

- `RolePermissionsType { role: String!, permissions: [String!]! }`.
- `rolePermissions: [RolePermissionsType!]!` query, guarded by `require_roles(SUPER_ADMIN)`.
- `updateRolePermissions(role: UserRoleEnum!, permissions: [String!]!): [String!]!` mutation, guarded by `require_roles(SUPER_ADMIN)` (deliberately not `require_perms(USERS_CHANGE_ROLE)`, so an ADMIN cannot escalate itself). Errors from unknown permission strings or SUPER_ADMIN edits surface as `Exception(str(e))` per the existing resolver pattern, with `try/finally` session close.

### C. Frontend route & page

- New page `frontend/src/pages/SuperAdminRoles.tsx`: matrix table with grouped row headers (Users: 9 perms; Merchants: 3; Transactions: `transactions:read-all`; Cash: `cash:operate`; Reports: `reports:export`; Master List: 2; Branding: `branding:write`; KYC: `kyc:review`; Platform: `platform:stats`), columns MEMBER / MERCHANT / ADMIN with MUI checkboxes, SUPER_ADMIN rendered as a locked all-checked column (or omitted with a note). Dirty-state tracking with per-role Save (single Save-all also acceptable), success/error snackbar, refetch of `GET_ROLE_PERMISSIONS` after save.
- Route `/super-admin/roles` in `App.tsx` wrapped in the existing `RequireSuperAdmin`; sidebar entry `{ label: 'Roles', path: '/super-admin/roles', superOnly: true }` in `Layout.tsx` alongside Dashboard / Users / Audit Log.
- New operations in `graphql/queries/admin.ts`: `GET_ROLE_PERMISSIONS` and `UPDATE_ROLE_PERMISSIONS`.
- `AuthContext`: login / complete-login / refresh payloads extended to carry the user's `scopes`; `can()` checks live scopes first, falls back to the hardcoded `ROLE_PERMISSIONS` mirror in `rbac.ts` when scopes are absent. `rbac.ts` constants remain as fallback only, not the source of truth.

### D. Data flow

Super-admin toggles checkboxes → `updateRolePermissions` → service validates, replaces rows, audit-logs, commits → UI refetches matrix. Affected users keep their current JWT until it expires (15 min) or they refresh; the next `_scopes_for()` call picks up the new mapping. Backend enforcement stays in `require_perms` against JWT scopes, so no resolver logic changes.

### E. Error handling & edge cases

- Unknown permission string → `ValidationError`, mutation fails, no partial writes (single transaction).
- `role == SUPER_ADMIN` → rejected; SUPER_ADMIN always has all permissions by construction.
- ADMIN may be emptied (that is the point); total lockout is impossible because SUPER_ADMIN bypasses `require_perms` paths via `require_roles` and its scopes are synthesized, not stored.
- Concurrent saves to the same role: last-write-wins (full-set replace per role); no cross-row version conflict handling.
- Non-super-admin calling the query/mutation → `Not authorized` from `require_roles`, consistent with `auditLogs`.
- Empty table (pre-seed DB) → `permissions_for` falls back to code constants, so login never breaks.

### F. Testing

Backend pytest against `ccash_test` (Alembic-migrated, per repo convention so CHECK constraints apply):

1. Seed migration produces today's mapping (ADMIN = 19, MEMBER = empty).
2. Super-admin updates MEMBER permissions; next login's scopes contain the new set.
3. Non-super-admin query/mutation rejected.
4. Invalid permission string rejected with no partial write.
5. SUPER_ADMIN edit rejected.
6. Audit log row written with old/new lists.
7. Revoked permission actually blocks: remove `users:read` from ADMIN → `adminUsers` raises for an ADMIN token.

Frontend: `npm run build` passes under strict TS (`noUnusedLocals`); manual verify as `superadmin@ccash.ph`: sidebar shows Roles, matrix loads grouped, toggle + save + refetch works, direct navigation to `/super-admin/roles` as ADMIN/MEMBER redirects to `/`.

## Non-goals

- Custom / renamable roles (the four `UserRole` enum values are fixed; no `roles` table, no `role_id` FK change).
- Immediate revocation for live sessions (no per-request DB check, no forced logout; 15-min access TTL bounds exposure).
- Per-permission audit rows (one row per role update, not per cell).
- Changes to money, transfer, notification, or report logic.
