# CCash Security Audit — 2026-10-11

Method: ponytail-audit (full-repo sweep). Scope: backend Python app end to end,
migration SQL, frontend auth/notification/QR flows (scanned), REST + GraphQL
surfaces. Load assumed: demo scale (tens of users, 4 uvicorn workers under PM2).

**What this repo does:** CCash/Campe Wallet — mobile-money app (send/cash-in/cash-out/QR pay)
on FastAPI + Strawberry GraphQL + SQLModel, React frontend, Celery workers.

## SQL injection

None found. All ~60 queries use SQLAlchemy ORM objects (`select()`, `update()`), which the
driver parameterizes. No `text()`, no f-string SQL, no psycopg2 anywhere in app code. The only
dynamic SQL strings are migrations 009/010 (`op.execute(sa.text(f"INSERT ... {values}"))`), where
`values` is built from hardcoded permission constants in the same file — no user input reaches it.
Test-only `text()` usage (table truncation) is not user-reachable.

## Brute force

Defenses present: per-IP rate limit on auth ops (10/min, `middleware/rate_limit.py:81`); Argon2id
password hashing; timing parity for unknown users at login (`auth/service.py:201`); single-use OTPs
with TTL; recovery codes are 8-char `secrets` (~46 bits), Argon2-hashed, single-use, 1h expiry — not
brute-forceable.

Gaps are findings #3 and #4 below.

## Findings

Numbered across groups; "Must fix" first.

### Must fix

**1. Money requests move money the wrong way** (`backend/app/domains/transactions/service.py:704-705`)
- **What this is:** A user can send a "money request"; the target approves it to pay.
- **Problem:** On approval the code credits the *approver* and debits the *requester* — exactly
  backwards. A requests ₱1,000 from B; B approves; B gets +₱1,000 and A loses ₱1,000 (or the commit
  500s on the `ck_wallets_balance_non_negative` check). No frontend calls this feature, but the
  GraphQL mutations (`requestMoney`, `respondToRequest`) are live for any API client.
- **Fix:** Swap the two `update_balance` lines and add an insufficient-funds check on the payer — or,
  since nothing in the UI uses the feature, delete `request_money`/`respond_to_request` entirely.
- **If we skip it:** Any client can reverse money flow between two accounts; balances contradict what
  both users see.

**2. Double-approval race on money requests** (`service.py:698-705`)
- **What this is:** The PENDING→SUCCESS transition in the same flow.
- **Problem:** The status check has no row lock, so two concurrent approvals both pass and both move
  money (double payment). Classic check-then-write race.
- **Fix:** Lock the transaction row (`with_for_update()`) before checking status. Disappears if #1's
  delete is taken.
- **If we skip it:** Duplicate payments under a fast double-click or scripted retry.

**3. OTPs generated with `random`, not a CSPRNG** (`backend/app/core/security.py:63-65`)
- **What this is:** 6-digit codes for registration and login 2FA.
- **Problem:** Mersenne Twister is predictable in principle; it's the wrong tool for security tokens.
- **Fix:** `secrets.randbelow(900_000) + 100_000`. One line.
- **If we skip it:** Every OTP flow carries a known weak-PRNG flag.

**4. No per-account attempt limits on auth** (`backend/app/middleware/rate_limit.py:81`,
`auth/service.py:133-154`)
- **What this is:** Brute-force protection today is one Redis counter per IP (10/min for auth ops).
- **Problem:** A distributed attack (rotating IPs) can grind 6-digit OTPs (~900k combos) against one
  email with no account-level penalty; failed guesses never invalidate the code. Same gap covers PIN
  retries and `resetPasswordWithCode`, which isn't even in the strict auth bucket (`_AUTH_OPERATIONS`
  misses both recovery mutation names).
- **Fix:** Redis counter per email — e.g. 5 failed `verifyOtp` → delete the OTP key; add the two
  recovery mutation names to `_AUTH_OPERATIONS`. ~10 lines.
- **If we skip it:** OTPs stay crackable from a botnet; single-IP attackers are already slowed (fine
  for demo, not for real users).

**5. Refresh tokens work where access tokens are expected** (`backend/app/core/security.py:50`,
`graphql/middleware.py:23`, `core/rest_auth.py`, `main.py:78`)
- **What this is:** One `decode_token()` validates signature + expiry but never the `type` claim.
- **Problem:** A 7-day refresh token passed as a Bearer token authenticates every user-level
  GraphQL/REST/WebSocket operation (admin checks fail — no scopes — but wallets, transactions and
  notifications all work). A stolen refresh token is a week-long session.
- **Fix:** Reject `type != "access"` in `get_context`, `require_user_token`/`require_perms_token`, and
  the WS endpoint. ~4 lines.
- **If we skip it:** Token theft has a 7-day blast radius instead of 15 minutes.

### Should fix

**6. Daily limit resets at worker-start time, not midnight** (`backend/app/tasks/celery_app.py:18-23`)
- **What this is:** Celery beat runs `reset_daily_limits` on a 24h *interval*.
- **Problem:** The "daily" send-limit window is anchored to when the worker last started. Every PM2
  restart shifts it up to 24h, so users' limits reset at random hours.
- **Fix:** `"schedule": crontab(hour=0, minute=0)` — timezone is already `Asia/Manila`. One line.
- **If we skip it:** Limits enforce a drifting window; "daily" is a lie after any restart.

**7. Idempotency replay leaks other users' transactions** (`transactions/service.py:80-82`,
`repository.py:23`)
- **What this is:** Replaying a used idempotency key returns that transaction's view (amount,
  counterparty masked mobile).
- **Problem:** The lookup is global, not scoped to the caller — anyone who knows another user's key
  reads their transfer details. Keys are client-side UUIDv4s (`crypto.randomUUID()`), so this needs a
  leaked key (logs, proxies), not guessing.
- **Fix:** Scope `get_by_idempotency_key` by the caller's wallet/user, or 404 for non-owners. A few lines.
- **If we skip it:** Low-probability PII leak via any channel that logs request bodies.

**8. KYC "upload" is a client-typed string** (`backend/app/domains/users/graphql.py:56`)
- **What this is:** `submitKyc(documentType, filePath)` — the user submits a path; the server stores
  it and never reads or validates a file (grep confirms nothing ever opens `file_path` server-side).
- **Problem:** There is no document on the server for an admin to review; KYC approval rests on trust
  in a string any client can send.
- **Fix:** A real upload endpoint storing bytes (the branding service already has
  `validate_upload` as a pattern), or drop the fake field and say KYC is manual/offline.
- **If we skip it:** The KYC gate is decorative; fine for demo, wrong for anything real.

**9. Email failures are swallowed** (`backend/app/tasks/notifications.py:73-74`)
- **What this is:** The SMTP fallback ends in `except Exception: pass`.
- **Problem:** If Mailpit/SMTP is down, OTP emails vanish with zero log line — registration and login
  silently stop working and nobody knows why.
- **Fix:** `logger.exception(...)` instead of `pass`. One line.
- **If we skip it:** Outages are discovered by confused users, not logs.

### Nice to have

**10. QR amount uses float math** (`transactions/service.py:317-321`) — `round(pesos * 100)` is
banker's rounding on a float; half-cent payloads can round the "wrong" way. Use `Decimal`. Edge case only.

**11. `update_daily_usage` missing the soft-delete filter** (`wallets/repository.py:68-73`) — every
sibling query filters `deleted_at`; this one doesn't. One clause.

**12. Master-list upload has no size cap** (`api/master_list.py:36`) — admin-only, but an unbounded
`file.read()` can OOM a worker; copy branding's 5MB check.

**13. User enumeration via distinct errors** — `verifyOtp`/`requestPasswordReset` say "User not found"
where login deliberately equalizes timing. Low risk; unify messages if it bothers you. (The
search-by-mobile feature, `resolveRecipient`, returning name + masked mobile is inherent to the
product, like GCash.)

## Lean

- **Money-request feature has zero frontend callers** (grep across `frontend/src`: none). Deleting it
  removes findings 1–2 and ~110 lines of untested service code.
- **The whole WebSocket stack is unused by the app** — the UI polls unread counts every 20s
  (`useNotifications.ts`) and never opens a socket; `manager.py` + `/ws` + cross-worker Redis pub/sub
  (~150 lines) are exercised only by `scripts/verify_realtime.py`. Keep it if real-time push is a
  product requirement; otherwise it's dead weight. (AGENTS.md mandates the script pre-demo, so this is
  flagged, not decided.)
- Lean: **-~260 lines** possible if both are deleted.

## Verdict

Fix #1 (or delete the feature) and #4 first — one is a live money-direction bug, the other is the only
real brute-force hole; #3/#5 are one-line hardening.

## Not checked

- Frontend pages beyond auth/notification/QR flows (72 files).
- nginx config and Docker network isolation.
- `admin/service.py` internal branches (934 lines — permission wiring verified, not every edit path).
- Test-suite contents beyond file names.
- Anything behind admin RBAC that can't be reached without an admin account.
