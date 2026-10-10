# Admin-Approved Password Recovery — Design Spec (2026-10-10)

## Goal
Replace direct admin password resets with an admin-approved recovery-code
flow. Admins can no longer set users' passwords directly in the UI; users
request recovery, an admin approves and relays a single-use code externally,
and the user sets their own new password. Every lifecycle event is audited.

## Decisions (from brainstorming)
- Code delivery: admin relays the code externally (shown once on approve,
  today's temp-password pattern). No code emails from the system.
- Code: 8-char `secrets` string, hashed at rest (Argon2), 1-hour expiry,
  single-use (→ `processed`, never reusable).
- Duplicates: new submit auto-cancels the requester's prior
  `pending`/`approved` rows.
- Admin module: ADMIN + SUPER_ADMIN only (new `users:recover-password`
  permission); auditors excluded.
- Removal: delete `ResetPasswordDialog` + 3 call sites; keep
  `adminResetPassword` mutation + `users:reset-password` permission dormant.
  Self-service Change Password (knows current password) stays.
- Unknown email on submit: explicit "Account not found" error.
- Audit: every lifecycle event writes an `audit_logs` row.

## 1. Data model
New `password_reset_requests` table (one migration):
- `id` UUID pk, `user_id` UUID fk → users (indexed).
- `code_hash` TEXT nullable (null until approved; plain code never stored).
- `status`: `pending` → `approved` | `cancelled`; `approved` → `processed` | `cancelled`.
- `requested_at`, `decided_at` nullable, `decided_by_admin_id` nullable,
  `used_at` nullable, `expires_at` nullable (set on approve = now + 1h).
- Follows soft-delete/version conventions (`deleted_at`, `version`) like
  other tables; repos filter `deleted_at.is_(None)`.

## 2. Public mutations (no login required)
- `requestPasswordReset(email) -> bool/success message`:
  - Unknown email → `ValidationError("Account not found")`.
  - Known → cancel requester's prior `pending`/`approved` rows (→ `cancelled`,
    reason superseded), insert new `pending` row, commit.
  - Returns generic success ("request recorded — ask an admin for your
    recovery code"). No code, no state disclosure.
- `resetPasswordWithCode(code, new_password, confirm_password)`:
  - Match passwords client- and server-side; 8–128 char rules (same as
    `change_password`).
  - Find row by comparing code against `code_hash` of open `approved` rows;
    require unexpired (`now <= expires_at`) and unused.
  - On success (single transaction): `user.password_hash =
    hash_password(new)`, row → `processed` + `used_at`, commit.
  - Anything else (unknown/expired/used/cancelled code) → uniform
    `ValidationError("Invalid or expired recovery code")` — no state oracle.

## 3. Admin module
- New `USERS_RECOVER_PASSWORD = "users:recover-password"` permission in
  `Permission`: ADMIN + SUPER_ADMIN inherit it automatically via `_ALL`;
  auditors excluded (do NOT add to `ROLE_PERMISSIONS[AUDITOR]`).
- The table migration ALSO seeds the `('ADMIN', 'users:recover-password')`
  row: runtime scopes are DB-backed (`permissions_for_role` returns a role's
  `role_permissions` rows when the table is non-empty; only SUPER_ADMIN is
  synthesized). Without this row ADMIN would be denied despite the constant.
  No auditor row. Downgrade deletes the row.
- Queries: `passwordResetRequests(status, search, limit, offset)` paginated
  (email, status chip, requested/decided times, decided-by) + count query.
- `approvePasswordResetRequest(request_id)`: pending-only; generates code,
  sets `code_hash`, `approved`, `decided_*`, `expires_at`; returns the PLAIN
  code ONCE in the mutation payload for the admin to relay externally.
- `cancelPasswordResetRequest(request_id)`: pending/approved-only → `cancelled`.
- Nav entry + route (e.g. `/admin/recovery`) behind `RequirePerm`;
  DataGrid + `ConfirmDialog` approve/deny + Snackbar feedback (existing
  admin-page patterns).

## 4. User dialogs (Login page)
- "Forgot password?" link → Dialog 1 (message: "Request from the admin a
  recovery code for you to be able to change your account password" +
  Proceed/Cancel) → Dialog 2 (email + Submit/Cancel) → success text.
- Separate "Reset password" text → Dialog 3 (recovery code + new +
  confirm fields, match/min-8 client checks, Submit/Cancel) → success
  ("password changed, please log in").
- Follows `Profile.tsx` dialog + `VerifyOtp.tsx` patterns, `maxWidth="xs"`.

## 5. Audit trail (all lifecycle events, existing `audit_logs` table)
- `password_recovery.request` on submit (notes auto-cancelled prior id).
- `password_recovery.approve` (deciding admin; NEVER the code).
- `password_recovery.cancel` (deciding admin, or "superseded by <new id>").
- `password_recovery.consume` on successful change (→ processed).
- `password_recovery.consume_failed` on rejected attempts (no code logged).
- Visible in both audit log pages (date filter + export included).

## 6. Removal + tests
- Delete `frontend/src/components/ResetPasswordDialog.tsx` + call sites in
  `SuperAdminUsers.tsx`, `AdminDashboard.tsx`, `MerchantsTable.tsx`.
  Leave `adminResetPassword` resolver + `users:reset-password` perm dormant.
- Tests: pending insert + prior auto-cancel; unknown email; approve reveals
  code once (hash stored, plain never persisted); consume sets hash +
  processed; reuse/expired/cancelled rejected uniformly; non-admin
  list/approve denied; audit rows written per event; full suite + build green.

## Out of scope
- Code delivery emails/SMS; code regeneration without new request; expiry
  longer than 1h; self-service (email-link) reset; auditor access to module;
  removing the dormant mutation/permission; touching Change Password.
