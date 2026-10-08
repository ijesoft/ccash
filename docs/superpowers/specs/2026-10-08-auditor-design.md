# Auditor Role — Design Spec (2026-10-08)

## Goal
New read-only `AUDITOR` user type with its own landing page `/auditor`. Access limited to: profile, audit logs, transactions (platform-wide), dashboard showing common totals (reuse `platformStats`).

## Decisions (from brainstorming)
- Strictly read-only. No cash in/out, send money, suspend/activate, role changes, KYC approvals, no exports.
- Transactions = new paginated platform-wide feed with filters + per-user drill-down.
- Dashboard totals = reuse existing `platformStats` (no new breakdowns).
- Audit logs = same full `auditLogs` rows as super-admin.
- Provisioning = ADMIN or SUPER_ADMIN mints via `updateUserRole`; seed `auditor@ccash.ph`.
- No wallet (like SUPER_ADMIN); lands on `/auditor` with minimal sidebar.

## 1. Backend role + RBAC
- `backend/app/domains/auth/models.py`: add `AUDITOR="AUDITOR"` to `UserRole`.
- `backend/app/domains/admin/graphql.py`: add `AUDITOR` to `UserRoleEnum` (Strawberry enum).
- `frontend/src/rbac.ts`: add `AUDITOR` to `Role`.
- `backend/app/core/rbac.py`: add `Permission.AUDIT_READ` (check existing `audit.*` names first); `ROLE_PERMISSIONS[AUDITOR] = frozenset({PLATFORM_STATS, USERS_READ, MERCHANTS_READ, TX_READ_ALL, AUDIT_READ})`. SUPER_ADMIN keeps all; ADMIN does NOT get `AUDIT_READ`.
- `frontend/src/rbac.ts`: mirror same permission set.
- Migration `010_add_auditor_role.py` (copy `008_add_super_admin.py` pattern: `ALTER TYPE userrole ADD VALUE 'AUDITOR'`): plus seed `role_permissions` rows for AUDITOR (copy `009_role_permissions.py` pattern). Keep `create_tables()` + migrations in sync.
- `backend/app/domains/wallets/service.py` (`get_or_create_wallet[_for_role]`) + `backend/app/domains/auth/service.py` (`verify_otp` wallet skip): treat AUDITOR like SUPER_ADMIN (raise / skip — no wallet).
- `register()` unchanged (MEMBER-only); `update_user_role` allows ADMIN or SUPER_ADMIN actor to set AUDITOR; keep existing guards (no self-demote, only super-admin mints SUPER_ADMIN, last-admin lockout).
- `backend/app/seed.py`: seed `auditor@ccash.ph` (ACTIVE, verified, no wallet) following SUPER_ADMIN pattern.

## 2. Resolvers
- Unchanged (AUDITOR passes automatically): `platformStats` (`platform:stats`), `adminUsers` / `adminAccountDetail` (`users:read`), `adminUserTransactions` (`users:read` + `transactions:read-all`), `me` (own profile).
- Changed: `auditLogs` / `auditLogsCount` in `admin/graphql.py` from `require_roles(SUPER_ADMIN)` to `require_perms(AUDIT_READ)`. Result: SUPER_ADMIN + AUDITOR pass; ADMIN/MEMBER/MERCHANT get "Not authorized".
- New: `adminAllTransactions(limit, offset, tx_type, status, search, from_date, to_date)` requiring `transactions:read-all`. Reuses `AdminService.list_all_transactions_for_report` + transaction view builders; returns paginated rows with both-side sender/receiver labels + total count for DataGrid pagination.
- Conventions kept: `try/finally: session.close()`, `ValidationError/NotFoundError → Exception(str(e))`, `transaction(id)` returns `None` on unauthorized (no probing).

## 3. Frontend landing + nav
- `frontend/src/context/AuthContext.tsx`: add `isAuditor` (role === "AUDITOR").
- `frontend/src/pages/Login.tsx`: navigate `AUDITOR → /auditor` (extend existing `SUPER_ADMIN → /super-admin` ternary).
- `frontend/src/pages/Dashboard.tsx`: redirect AUDITOR away from `/` to `/auditor` (mirror `isSuperAdmin` effect).
- `frontend/src/App.tsx`: add `/auditor` (AuditorDashboard), `/auditor/transactions` (AuditorTransactions), `/auditor/audit-log` (AuditorAuditLog) behind `RequireRole(["AUDITOR"])`; keep `/profile` as-is. Import `RequireRole` (currently only `RequirePerm, RequireSuperAdmin` imported).
- `frontend/src/components/Layout.tsx`: add `auditorOnly` nav entries (Dashboard `/auditor`, Transactions `/auditor/transactions`, Audit Log `/auditor/audit-log`, Profile `/profile`); hide all member/admin/merchant nav for AUDITOR (mirror super-admin pattern); hide auditor entries for all other roles.
- New `GET_ALL_TRANSACTIONS` in `frontend/src/graphql/queries/admin.ts`; reuse `GET_ADMIN_STATS`, `GET_AUDIT_LOGS`, `GET_ADMIN_USER_TRANSACTIONS`.

## 4. Pages
- `AuditorDashboard.tsx` (new, copy `SuperAdminDashboard.tsx`): hero `totalWalletBalanceCents` + role counts/balances + users/wallets/transactions/volume cards. Read-only, no action buttons, no export.
- `AuditorTransactions.tsx` (new): platform-wide DataGrid (type/status/date/search filters, server pagination via `adminAllTransactions`) + row click → dialog with `adminUserTransactions(userId)` reusing `WalletBalances.tsx` per-viewer direction/counterparty rendering.
- `AuditorAuditLog.tsx` (new, reuse `SuperAdminAuditLog.tsx` verbatim): same action filter (`transaction.send`, `qr_payment`, `cash_in`, `cash_out`, `role.change`) + search + DataGrid.
- `Profile.tsx`: unchanged.

## 5. Data flow / errors / tests
- Flow: login → JWT `role=AUDITOR` + scopes from `permissions_for_role` → `RequireRole`/`RequirePerm` guards → `require_perms` resolvers → existing services.
- Errors: unauthenticated → `/login`; unauthorized (`Exception("Not authorized")`) → frontend bounces to `/`; no stack traces to client.
- Tests (`backend/tests/test_auditor.py`, new): auditor can read stats/users/ledger/audit/me; cannot `send_money`/`cash_in`/`cash_out`/`suspend`/`update_role`/`kyc_review`; ADMIN still blocked from `auditLogs`; MEMBER blocked from stats/ledger. Frontend: `tsc` + `npm run build`. Seed check: `auditor@ccash.ph` exists, no wallet.

## Out of scope
- No new totals breakdowns (by type/status/date, fees, time-series) — reuse `platformStats` only.
- No exports for auditor (strictly read-only).
- No wallet flows for auditor.
- No changes to idempotency, locking, notification fan-out, WebSocket fan-out.
