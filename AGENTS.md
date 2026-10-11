# CCash — Agent Guide

## Deployment: PM2 on the host, infra in Docker

This is the deployment that actually runs. Application processes (backend,
Celery, frontend) run under PM2 on the host; only stateful infrastructure runs in
Docker via `docker-compose.infra.yml`. The full `docker-compose.yml` in this repo
is **not** what serves the app — do not follow it expecting a working stack.

```bash
docker compose -f docker-compose.infra.yml up -d   # postgres, redis, rabbitmq, mailpit
pm2 start ecosystem.config.js                      # backend, celery, frontend
cd backend && ./.venv/bin/python -m alembic -c migrations/alembic.ini upgrade head
./.venv/bin/python -m app.seed                     # seed test users
```

| Service        | URL                              | Process         |
|----------------|----------------------------------|-----------------|
| Frontend       | http://localhost:8830/           | pm2 `ccash-frontend` (`vite preview`) |
| GraphQL (via frontend proxy) | http://localhost:8830/api/graphql | proxied to 8831 |
| GraphQL (direct)| http://localhost:8831/graphql    | pm2 `ccash-backend` |
| Mailpit UI     | http://localhost:8025/           | docker `ccash-mailpit` |
| Celery worker + beat | —                          | pm2 `ccash-celery` |

The browser only ever talks to port 8830. `vite preview` inherits `server.proxy`
from `vite.config.ts`, so `/api` → 8831 and `/ws` → 8831 both work in the
preview build.

## Rebuild after code changes

```bash
# backend (Python is not hot-reloaded under PM2)
pm2 restart ccash-backend

# frontend must be rebuilt: `vite preview` serves dist/, not src/
cd frontend && npm run build && pm2 restart ccash-frontend

pm2 logs ccash-backend --lines 50
```

## Before every demo

```bash
cd backend && ./.venv/bin/python -m pytest        # 88 tests
./backend/.venv/bin/python scripts/verify_realtime.py   # live WebSocket push
```

`verify_realtime.py` is not optional. The WebSocket registry is per-process, so
under `uvicorn --workers 4` a push raised in one worker can only reach a socket
held by another via the Redis pub/sub fan-out in `app/websocket/manager.py`. No
unit test covers that; this script does.

## Architecture

**Stack:** Python 3.13 / FastAPI / Strawberry GraphQL / SQLModel / Celery — React 19 / Apollo Client / MUI — PostgreSQL 17 / Redis 7 / RabbitMQ 3.13

**Three Docker networks:** `frontend_net`, `backend_net`, `monitoring_net`. Backend and Celery depend on postgres+redis+rabbitmq being healthy.

**Nginx routes:** `/api/` → backend:8000, `/` → frontend:80, `/ws` → backend websocket, `/pgadmin/`, `/mailpit/`

## Backend structure (DDD per domain)

```
backend/app/
  domains/
    auth/          # User registration, login, OTP, TOTP/2FA
    wallets/       # Wallet CRUD, PIN, favorites
    transactions/  # Send money, cash in/out (idempotent)
    users/         # KYC document upload
    notifications/ # Real-time notifications via WebSocket
    admin/         # Admin user management, platformStats (+totalWalletBalanceCents),
    #                adminUserTransactions (admin view of one user's history)
  graphql/         # Root schema (aggregates all domain types via class inheritance), middleware, scalars
  core/            # Config, security (JWT, Argon2id, pyotp), custom errors
  tasks/           # Celery task definitions (email, daily limit reset)
  websocket/       # ConnectionManager (per-user WebSocket tracking)
```

Each domain follows: `models.py` → `repository.py` → `service.py` → `graphql.py`. The root `graphql/schema.py` imports each domain's Query/Mutation types and combines them via multiple inheritance.

## Key conventions

- **Money:** all amounts in `_cents` **BigInteger** columns. Never use floats for currency, and never
  declare a money field as a plain `int` — SQLModel maps that to INTEGER, capping the column at
  ₱21,474,836.47.
- **Amount validation lives in the service layer.** `Field(ge=0)` on a SQLModel `table=True` model is
  column metadata and is **never validated at runtime**. Use
  `app.domains.transactions.policy.validate_amount`; DB CHECK constraints (migration 002) are the
  backstop. A negative amount that reaches `update_balance` runs the transfer backwards.
- **Direction is per-viewer, never intrinsic.** One row is written per transfer. Whether it is money
  in or out depends on who is asking, so resolvers return a `TransactionView`
  (`direction` + `counterparty`) built against the caller's wallet. Clients must never derive a sign
  from `type`.
- **Every financial mutation notifies both parties** via `TransactionService._queue_notification`.
  Pushes are buffered and released only after `session.commit()`, so a rolled-back transfer never
  emits one.
- **Idempotency:** every financial mutation requires an `idempotency_key`. Returns existing tx if duplicate.
  A concurrent double-submit is resolved on `IntegrityError` by returning the winning transaction.
- **Lock wallets in sorted id order** (`TransactionService._lock_pair`) so concurrent A→B and B→A
  transfers queue instead of deadlocking.
- **Schema has two sources of truth:** `create_tables()` runs at startup *and* Alembic migrations
  exist. They are currently in sync — verified by diffing a `create_all` database against an
  `alembic upgrade head` database. If you change a model, change the migration too and re-check.
- **Soft delete:** every table has `deleted_at` + `version` (optimistic locking). Repos filter `deleted_at.is_(None)`.
- **Session/transaction lifecycle:** per-request session via `async_session_factory()` in GraphQL resolver. **Services must call `session.commit()` explicitly** — `flush()` alone will be rolled back when the session closes.
- **GraphQL pattern:** `try` / `finally` with `service.session.close()` in every resolver. Errors mapped from `app.core.errors` to `Exception(str(e))`.
- **OTP flow (registration verify):** Email OTP (`otp:{email}`) or TOTP (`verify_totp_secret:{email}`) both checked via `verifyOtp` mutation. Authenticator app tab is default.
- **Login 2FA:** TOTP checked first, then falls back to email OTP (`login_otp:{email}`).
- **JWT:** access token (15min) + refresh token (7 days stored in Redis key `refresh:{token_id}`).
- **Password hashing:** Argon2id via `argon2-cffi`.
- **GraphQL enums in Strawberry** must inherit from `enum.Enum` (or `str, enum.Enum`), not be plain classes.
- **`metadata` is a reserved attribute name** in SQLAlchemy/SQLModel. Use `data`, `tx_metadata`, or similar instead.
- **Admin views of user data get dedicated `admin*` resolvers** (e.g. `adminUserTransactions`)
  that reuse the domain view builders with the target user's wallet as viewer — never
  bypass the ownership checks in the user-facing resolvers.

## Frontend

- Apollo Client at `/api/graphql` with Bearer token from `localStorage.getItem("accessToken")`.
- Vite dev server (port 5173) proxies `/api` → backend:8000 (only when running outside Docker).
- Tokens + user stored in localStorage: `accessToken`, `refreshToken`, `user`.
- GraphQL operations in `src/graphql/mutations/` and `src/graphql/queries/`.
- Strict TypeScript: `noUnusedLocals`, `noUnusedParameters` enforced.
- Fresh checkout needs `cd frontend && npm install` before the first build (`deploy-pm2.sh` does this).
- Admin-only **Total Wallet Balances** sidebar card (`Layout.tsx`): sum of ACTIVE, non-deleted
  wallet balances via `platformStats.totalWalletBalanceCents`; clickable → `/wallet-balances`.
- `/wallet-balances` page (`WalletBalances.tsx`, behind `AdminRoute`): total card + per-user
  balances table (`adminUsers`); clicking a name opens a dialog with that user's history via
  `adminUserTransactions(userId)`, rendered with the same per-viewer direction/counterparty
  semantics as the Transactions page. Admin Dashboard itself is unchanged.

## Infrastructure quirks

- **RabbitMQ** pinned to `3.13-management-alpine` — 4.x drops `transient_nonexcl_queues` that Celery/kombu needs.
- **Loki** config uses TSDB schema v13 (`boltdb-shipper` removed in latest Loki). Container runs as root for WAL write permissions.
- **Celery** registered tasks live in `app.tasks.notifications`. Daily limit reset runs on beat schedule (24h).
- **Prometheus instrumentator** must be initialized at module level, **not** inside the FastAPI lifespan (cannot add middleware after app start).
- **Mailpit** captures all outgoing emails (no real SMTP needed). UI at http://localhost:8025.
- **Infra IPs are pinned** in `docker-compose.infra.yml` (172.28.0.2 postgres, .3 rabbitmq, .4 redis,
  .5 mailpit) because `backend/.env` addresses them by IP. Without a declared subnet Docker
  reassigns addresses on recreate and the backend silently loses its database.
- **Dev-host port remap (local diff, not upstream):** `lending_postgres`/`lending_redis` already
  occupy host ports 5433/6380 on this machine, so `docker-compose.infra.yml` maps ccash postgres →
  `127.0.0.1:5434` and redis → `127.0.0.1:6381`, with `backend/.env` `DATABASE_URL`/`REDIS_URL`
  updated to match. Container IPs (172.28.0.x) are unchanged. A fresh clone uses 5433/6380 —
  do not revert this unless the lending stack is stopped. Root `.env` also gained the required
  `REDIS_PASSWORD` (infra compose interpolates it; backend `REDIS_URL` carries it as
  `redis://:<password>@...`).
- **A Celery worker must be running.** Without `pm2 ccash-celery`, every
  `send_email_notification.delay()` queues to RabbitMQ with no consumer and registration/login OTP
  emails are never delivered.

## Commands

| Action | Command |
|--------|---------|
| Seed DB | `cd backend && ./.venv/bin/python -m app.seed` |
| Run migrations | `cd backend && ./.venv/bin/python -m alembic -c migrations/alembic.ini upgrade head` |
| Check logs | `pm2 logs ccash-backend --lines 50` (files in `logs/`, PM2 appends `-<id>`) |
| Restart backend | `pm2 restart ccash-backend` |
| Rebuild frontend | `cd frontend && npm run build && pm2 restart ccash-frontend` |
| Redis CLI | `docker exec ccash-redis redis-cli -a "$REDIS_PASSWORD" <cmd>` (redis requires auth since the `.env` fix) |
| Access PostgreSQL | `docker exec -it ccash-postgres psql -U ccash -d ccash` |
| Watch pushes | `docker exec ccash-redis redis-cli -a "$REDIS_PASSWORD" subscribe ccash:ws:push` |

## Test users (seeded)

| Role  | Email             | Password    |
|-------|-------------------|-------------|
| Admin | admin@ccash.ph    | Admin123!   |
| User  | alice@ccash.ph    | Alice123!   |
| User  | bob@ccash.ph      | Bob123!     |

Wallet balances: Admin = ₱100,000 | Alice = ₱5,000 | Bob = ₱2,500.

## Testing

```bash
cd backend && ./.venv/bin/python -m pytest              # 88 tests
./.venv/bin/python -m pytest --cov=app                  # with coverage
```

Tests run against a real PostgreSQL database (`ccash_test`, or `TEST_DATABASE_URL`) that
`tests/conftest.py` creates and migrates with Alembic on first use, then truncates between tests.
Alembic rather than `create_all` on purpose: the DB CHECK constraints from migration 002 are part of
what the tests assert.

- `tests/test_transactions.py` — one test per defect found in the Phase 0 audit: negative and
  zero amounts, over-cap amounts, self-transfer, insufficient funds, daily limit, frozen wallets,
  idempotent replay, per-viewer direction, counterparty masking, notification fan-out, and the
  ownership check on `transaction(id)`.
- `tests/test_policy.py` — amount policy, reference format, mobile masking, peso formatting. No DB.

Not covered by pytest: cross-worker WebSocket delivery. Use `scripts/verify_realtime.py`.

## Security audit (2026-10-11, ponytail-audit)

Full report: `docs/security-audit.md`. Summary below.

Load assumed: demo scale. SQL injection: none found — all queries are parameterized
SQLAlchemy ORM; the only f-string SQL is in migrations 009/010 with hardcoded constants.

### Must fix

1. **Money requests move money backwards** (`transactions/service.py:704-705`). `respond_to_request`
   credits the approver (payer) and debits the requester — reversed. No frontend calls it, but the
   GraphQL mutations are live. Fix: swap the two `update_balance` lines + add an insufficient-funds
   check on the payer — or delete `request_money`/`respond_to_request` (nothing in the UI uses them).
2. **Double-approval race** (`transactions/service.py:698-705`). PENDING→SUCCESS with no row lock;
   two concurrent approvals both move money. Fix: `with_for_update()` on the tx row (or delete, see 1).
3. **OTP from `random`, not a CSPRNG** (`core/security.py:63-65`). Mersenne Twister for security codes.
   Fix: `secrets.randbelow(900_000) + 100_000`.
4. **No per-account attempt limits** (`middleware/rate_limit.py:81`). Only per-IP rate limiting (10/min
   on auth ops); failed OTP guesses never invalidate the code, so a distributed attack can grind 6-digit
   codes (~900k). `resetPasswordWithCode`/`requestPasswordReset` also miss `_AUTH_OPERATIONS`.
   Fix: Redis counter per email (e.g. 5 failures → delete OTP key) + add the recovery mutation names.
5. **Refresh tokens accepted where access tokens are expected** (`core/security.py:50`,
   `graphql/middleware.py:23`, `core/rest_auth.py`, `main.py:78`). `decode_token` never checks the
   `type` claim, so a 7-day refresh token authenticates all user-level GraphQL/REST/WS operations.
   Fix: reject `type != "access"` in those four places.

### Should fix

6. **Daily limit resets at worker start, not midnight** (`tasks/celery_app.py:18-23`). Beat uses a 24h
   *interval*, so every PM2 restart shifts the "daily" window up to 24h. Fix: `crontab(hour=0, minute=0)`
   (timezone already `Asia/Manila`).
7. **Idempotency replay leaks other users' tx views** (`transactions/service.py:80-82`,
   `repository.py:23`). Lookup is global, not scoped to the caller; anyone with a leaked key reads that
   transfer's amount + counterparty masked mobile. Fix: scope by caller or 404 for non-owners.
8. **KYC "upload" is a client-typed string** (`domains/users/graphql.py:56`). `submitKyc` stores a
   client-supplied `file_path`; the server never reads or validates a file, so admin approval has no
   artifact to review. Fix: real upload endpoint (pattern: `branding_service.validate_upload`) or drop
   the field and make KYC explicitly manual.
9. **Email failures swallowed** (`tasks/notifications.py:73-74`). SMTP fallback ends in
   `except Exception: pass` — lost OTP emails with no log line. Fix: `logger.exception`.

### Nice to have

10. QR amount uses float math, banker's rounding at half-cent boundaries (`transactions/service.py:317-321`) — use `Decimal`.
11. `update_daily_usage` missing the `deleted_at.is_(None)` filter every sibling has (`wallets/repository.py:68-73`).
12. Master-list upload has no size cap (`api/master_list.py:36`, admin-only OOM) — copy branding's 5MB check.
13. User enumeration via distinct "User not found" errors in `verifyOtp`/`requestPasswordReset` while login equalizes timing.

### Lean candidates

- Money-request feature: zero frontend callers; deleting it removes findings 1–2 and ~110 lines of untested code.
- WebSocket stack (`websocket/manager.py`, `/ws`, `verify_realtime.py`, ~150 lines): the UI polls unread
  counts every 20s (`useNotifications.ts`) and never opens a socket; only the script exercises it. Keep
  if real-time push is a product requirement.

**Verdict:** fix #1 (or delete) and #4 first; #3/#5 are one-line hardening. Not checked: frontend pages
beyond auth/notification/QR flows, nginx config, `admin/service.py` internal branches, Docker network isolation.
