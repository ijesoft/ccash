# CCash — Agent Guide

## Quick start

```bash
cp .env.example .env
docker compose up -d                    # start everything
docker compose exec backend python -m app.seed   # seed test users
```

| Service   | URL                            |
|-----------|--------------------------------|
| Frontend  | http://localhost/               |
| GraphQL   | http://localhost/api/graphql    |
| Mailpit   | http://localhost/mailpit        |
| pgAdmin   | http://localhost/pgadmin        |
| Grafana   | http://localhost:3001           |

## Rebuild after code changes

```bash
docker compose build backend && docker compose up -d backend
docker compose build frontend && docker compose up -d frontend
docker compose up -d --force-recreate <service>   # force recreate if stuck
```

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

- **Money:** all amounts in `_cents` integers. Never use floats for currency.
- **Idempotency:** every financial mutation requires an `idempotency_key`. Returns existing tx if duplicate.
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
- **Mailpit** captures all outgoing emails in development (no real SMTP needed). UI at http://localhost/mailpit.

## Commands

| Action | Command |
|--------|---------|
| Seed DB | `docker compose exec backend python -m app.seed` |
| Check logs | `docker logs ccash-backend --tail 30` |
| Run single task | `docker compose exec backend python -c "..."` |
| Start celery worker | `docker start ccash-celery-worker` (if stuck in Created) |
| Redis CLI | `docker exec ccash-redis redis-cli <cmd>` |
| Access PostgreSQL | `docker exec -it ccash-postgres psql -U ccash -d ccash` |

## Test users (seeded)

| Role  | Email             | Password    |
|-------|-------------------|-------------|
| Admin | admin@ccash.ph    | Admin123!   |
| User  | alice@ccash.ph    | Alice123!   |
| User  | bob@ccash.ph      | Bob123!     |

Wallet balances: Admin = ₱100,000 | Alice = ₱5,000 | Bob = ₱2,500.

## Testing

No test files exist yet. `pytest`, `pytest-asyncio`, `pytest-cov`, and `httpx` are in `requirements.txt` but unused.
