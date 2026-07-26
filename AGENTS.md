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
cd backend && ./.venv/bin/python -m pytest        # 51 tests
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
    admin/         # Admin user management
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

## Frontend

- Apollo Client at `/api/graphql` with Bearer token from `localStorage.getItem("accessToken")`.
- Vite dev server (port 5173) proxies `/api` → backend:8000 (only when running outside Docker).
- Tokens + user stored in localStorage: `accessToken`, `refreshToken`, `user`.
- GraphQL operations in `src/graphql/mutations/` and `src/graphql/queries/`.
- Strict TypeScript: `noUnusedLocals`, `noUnusedParameters` enforced.

## Infrastructure quirks

- **RabbitMQ** pinned to `3.13-management-alpine` — 4.x drops `transient_nonexcl_queues` that Celery/kombu needs.
- **Loki** config uses TSDB schema v13 (`boltdb-shipper` removed in latest Loki). Container runs as root for WAL write permissions.
- **Celery** registered tasks live in `app.tasks.notifications`. Daily limit reset runs on beat schedule (24h).
- **Prometheus instrumentator** must be initialized at module level, **not** inside the FastAPI lifespan (cannot add middleware after app start).
- **Mailpit** captures all outgoing emails (no real SMTP needed). UI at http://localhost:8025.
- **Infra IPs are pinned** in `docker-compose.infra.yml` (172.28.0.2 postgres, .3 rabbitmq, .4 redis,
  .5 mailpit) because `backend/.env` addresses them by IP. Without a declared subnet Docker
  reassigns addresses on recreate and the backend silently loses its database.
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
| Redis CLI | `docker exec ccash-redis redis-cli <cmd>` |
| Access PostgreSQL | `docker exec -it ccash-postgres psql -U ccash -d ccash` |
| Watch pushes | `docker exec ccash-redis redis-cli subscribe ccash:ws:push` |

## Test users (seeded)

| Role  | Email             | Password    |
|-------|-------------------|-------------|
| Admin | admin@ccash.ph    | Admin123!   |
| User  | alice@ccash.ph    | Alice123!   |
| User  | bob@ccash.ph      | Bob123!     |

Wallet balances: Admin = ₱100,000 | Alice = ₱5,000 | Bob = ₱2,500.

## Testing

```bash
cd backend && ./.venv/bin/python -m pytest              # 51 tests
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
