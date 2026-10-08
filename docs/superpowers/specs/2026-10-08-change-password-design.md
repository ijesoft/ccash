# Change Password from Profile — Design

Date: 2026-10-08
Status: Approved (pending spec review)
Scope: Logged-in user changes own password from Profile page via dialog form.

## 1. Goal

Let a logged-in user change their password from the Profile page. A "Change Password"
button opens a dialog form with Current password + New password + Confirm password.
Frontend validates New == Confirm (same string/behavior as `Register.tsx`), then a new
authenticated GraphQL mutation saves the new password (Argon2id hash).

## 2. Decisions (from brainstorming Q&A)

- Require current password: YES (3 fields, not 2). Prevents session-hijack lockout.
- Validation parity with signup: frontend match check (`"Passwords do not match"`) +
  `"At least 8 characters"` hint on New field, enforced server-side (`>= 8 chars`)
  so it cannot be bypassed (signup currently only hints; change-password enforces).
- Presentation: MUI Dialog modal opened from Profile, matching existing 2FA card pattern.
- No email OTP step. No other-session revocation in v1 (out of scope).
- Visual companion: declined.

## 3. Architecture

Follows existing DDD-per-domain pattern (`models.py` → `repository.py` → `service.py` →
`graphql.py`) and the `enable2fa` authenticated-mutation precedent:

```
Profile.tsx (Dialog) → CHANGE_PASSWORD gql → AuthMutations.changePassword
  → AuthService.change_password() → verify_password / hash_password (app.core.security)
  → UserRepository.update + session.commit()
```

No model/migration change: reuses `users.password_hash` column.

## 4. Components

### 4.1 Backend — `backend/app/domains/auth/service.py`

New method:

```python
async def change_password(self, user_id: UUID, current_password: str, new_password: str) -> bool
```

- Load user via `self.repo.get_by_id(user_id)`; if missing raise `NotFoundError`.
- `verify_password(current_password, user.password_hash)`; on False raise
  `AuthenticationError("Current password is incorrect")`.
- Validate `new_password`: `len >= 8` else `ValidationError("Password must be at least 8 characters")`.
- `user.password_hash = hash_password(new_password)`; `await self.repo.update(user)`;
  `await self.session.commit()`; return True.
- Note: `Field(ge=...)` n/a here (not a SQLModel field); explicit check in service
  per amount-validation convention (service-layer validation).

### 4.2 Backend — `backend/app/domains/auth/graphql.py`

New mutation on `AuthMutations`:

```graphql
mutation ChangePassword($currentPassword: String!, $newPassword: String!) {
  changePassword(currentPassword: $currentPassword, newPassword: $newPassword)
}
```

- Guard: `if not context.user_id: raise Exception("Not authenticated")` (same as `enable_2fa`).
- `try / finally: await service.session.close()`; map
  `(AuthenticationError, ValidationError, NotFoundError)` → `Exception(str(e))`.

### 4.3 Frontend — `frontend/src/graphql/mutations/auth.ts`

Add `CHANGE_PASSWORD` gql document (see above).

### 4.4 Frontend — `frontend/src/pages/Profile.tsx`

- "Change Password" button in Account Information card.
- MUI `Dialog` + `DialogTitle/Content/Actions` with three `TextField type="password"`:
  Current (`autoComplete="current-password"`), New + Confirm (`autoComplete="new-password"`).
- Local state: `currentPassword, newPassword, confirmPassword, cpError, cpSuccess, cpOpen`.
- Submit: if `newPassword !== confirmPassword` → `"Passwords do not match"`, no request.
  Else call mutation; on success show Alert and clear fields (dialog stays open so the
  confirmation is visible; closing via Cancel/backdrop/Escape resets all dialog state);
  on error show GraphQL message in Alert. Save is disabled while the request is in flight.
- Strict TS: no unused locals/params.

## 5. Data flow

1. User opens Profile → clicks Change Password → dialog opens.
2. User fills current/new/confirm → client checks new == confirm, len >= 8 hint.
3. `changePassword` sent with Bearer token from `localStorage.accessToken` via Apollo (`/api/graphql`).
4. Middleware resolves `context.user_id`; service verifies current, hashes new, commits.
5. `true` returned → frontend success state.

## 6. Error handling

| Case | Where | Message |
|------|-------|---------|
| Not logged in | graphql guard | `Not authenticated` |
| Wrong current | service | `Current password is incorrect` (generic, no user enum) |
| Mismatch | frontend, pre-request | `Passwords do not match` (same as Register) |
| Too short | frontend hint + service | `Password must be at least 8 characters` |
| User missing | service | `User not found` |

No password logging. No timing-oracle concern beyond existing `verify_password`.

## 7. Testing

- Backend pytest (mirror `tests/test_transactions.py` style, real PG via Alembic):
  1. correct current → password changes; login with new succeeds, old fails;
  2. wrong current → `AuthenticationError`, hash unchanged;
  3. short new → `ValidationError`;
  4. unauthenticated mutation → `Not authenticated`.
- Frontend manual: dialog open/close, mismatch blocked, short blocked, wrong-current
  error shows, success clears + closes.
- Full suite: `cd backend && ./.venv/bin/python -m pytest` (88 tests baseline).
- No realtime/WS impact.

## 8. Out of scope

- Forgot-password / email-OTP reset (separate flow; needs Celery + Mailpit).
- Revoking other refresh tokens on change; password-strength meter; audit log entry.
- Admin-initiated resets (`generate_temp_password` path untouched).

## 9. Files to touch (for implementation plan)

1. `backend/app/domains/auth/service.py` — add `change_password`.
2. `backend/app/domains/auth/graphql.py` — add `changePassword` mutation.
3. `frontend/src/graphql/mutations/auth.ts` — add `CHANGE_PASSWORD`.
4. `frontend/src/pages/Profile.tsx` — dialog + wiring.
5. `backend/tests/test_auth_change_password.py` (new) — cases above.
