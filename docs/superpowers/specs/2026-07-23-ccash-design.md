# CCash Digital Wallet — Design Spec

## Overview
Production-ready digital wallet platform (GCash-like) built with Python 3.13, FastAPI, Strawberry GraphQL, React 19, PostgreSQL 17, running entirely via Docker Compose.

## MVP Feature Set
1. Registration / Login / OTP / 2FA
2. KYC (Basic + Full)
3. Wallet Creation
4. Cash In (internal simulation)
5. Cash Out (internal simulation)
6. Send Money / Receive Money
7. QR Payment (scan + display)
8. Transaction History / Wallet Statement
9. Favorites (saved recipients)
10. Notifications (in-app + email)
11. Admin Dashboard

**Excluded from MVP:** Bills Payment, Merchant Payment, Bank Transfer

## Architecture

### Overall
```
                    Nginx (Reverse Proxy + Static)
                    ┌─────┴─────┐
               React App    FastAPI + Strawberry GraphQL
                    │              │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
         PostgreSQL    Redis       RabbitMQ
         17 (Main)   (Cache/       (Async
                      Session)     Jobs)
```

### Key Decisions
- **Modular monolith** — single deployable unit with DDD module boundaries
- **Simplified ledger** — immutable transaction log per wallet (no GAAP double-entry)
- **Internal cash in/out** — no payment gateway integration in MVP
- **GraphQL-first** API with Strawberry; REST only for file uploads

### Data Flow (Send Money)
1. Client sends GraphQL mutation `sendMoney(from, to, amount, idempotencyKey)`
2. Strawberry resolver calls `TransactionService.transfer()`
3. Service opens DB transaction, locks sender wallet (`SELECT FOR UPDATE`)
4. Validates balance, creates Transaction record, updates both wallet balances
5. Publishes event to RabbitMQ for notification
6. Returns updated wallet state via GraphQL response
7. WebSocket push notifies receiver in real-time

## Folder Structure
```
ccash/
├── backend/
│   ├── app/
│   │   ├── api/                  # GraphQL & REST endpoints
│   │   │   ├── graphql/          # Strawberry schema, resolvers
│   │   │   ├── rest/             # Auth, file upload endpoints
│   │   │   └── websocket/        # Real-time connections
│   │   ├── core/                 # Config, security, DB session
│   │   ├── domains/              # DDD bounded contexts
│   │   │   ├── auth/             # Registration, login, 2FA, OTP
│   │   │   ├── users/            # Profile, KYC, devices
│   │   │   ├── wallets/          # Wallet CRUD, balance
│   │   │   ├── transactions/     # Send, receive, cash in/out, QR
│   │   │   ├── notifications/    # In-app, push, email
│   │   │   └── admin/            # Admin operations
│   │   ├── models/               # SQLModel entities
│   │   ├── repositories/         # Data access layer
│   │   ├── services/             # Business logic
│   │   └── tasks/                # Celery tasks
│   ├── migrations/               # Alembic
│   ├── tests/
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/           # Reusable MUI components
│   │   ├── pages/                # Route pages
│   │   ├── hooks/                # React Query hooks
│   │   ├── graphql/              # Apollo queries/mutations
│   │   ├── layouts/
│   │   └── utils/
│   ├── Dockerfile
│   └── vite.config.ts
├── docker/
│   ├── nginx/
│   ├── prometheus/
│   └── grafana/
├── docker-compose.yml
├── docker-compose.prod.yml
└── .env.example
```

## Database Design

### Tables

**users**
- id (UUID, PK), email (unique), phone (unique), password_hash (Argon2)
- status: PENDING | ACTIVE | SUSPENDED
- kyc_level: NONE | BASIC | FULL
- device_id (nullable), totp_secret (nullable), is_2fa_enabled
- created_at, updated_at, deleted_at (soft delete), version (optimistic lock)

**wallets**
- id (UUID, PK), user_id (FK -> users)
- balance_cents (BIGINT, default 0), currency (default 'PHP')
- status: ACTIVE | FROZEN | CLOSED
- pin_hash, daily_send_limit_cents, daily_send_used_cents
- created_at, updated_at, deleted_at, version

**transactions**
- id (UUID, PK), idempotency_key (unique, indexed)
- type: CASH_IN | CASH_OUT | SEND | RECEIVE | QR_PAYMENT
- status: PENDING | SUCCESS | FAILED | REVERSED
- sender_wallet_id (FK, nullable), receiver_wallet_id (FK, nullable)
- amount_cents (BIGINT), fee_cents, net_amount_cents
- reference, description, metadata (JSONB)
- created_at, updated_at, created_by

**notifications**
- id (UUID, PK), user_id (FK -> users)
- type, title, body, is_read, metadata (JSONB), created_at

**audit_logs**
- id (UUID, PK), user_id (nullable), action, resource_type, resource_id
- old_values (JSONB), new_values (JSONB), ip_address, user_agent, created_at

### Rules
- All monetary amounts in integer cents (BIGINT)
- idempotency_key with unique index prevents duplicate charges
- Wallet balance updated atomically within DB transactions
- Every balance change creates an immutable transaction record
- Soft delete on users and wallets
- Optimistic locking via version column

## Authentication

### Flows
- **Register** → OTP sent → Verify OTP → Active user → JWT issued
- **Login** → Verify password → Check 2FA → Device registration → JWT pair
- **Refresh** → Validate refresh token in Redis → Issue new pair
- **Logout** → Revoke refresh token in Redis

### Token Structure
- Access: `{sub: user_id, scopes: ["wallet:read", "wallet:write"], exp: 15min}`
- Refresh: `{sub: user_id, token_id: uuid, exp: 7 days}` stored in Redis

### Security
- Argon2id for passwords
- TOTP for 2FA
- OTP via email (Mailpit in dev)
- Rate limiting via Redis (5 login attempts/min)
- CSRF via SameSite=Strict cookies
- CORS restricted to frontend origin
- Audit logs for all security-sensitive actions
- RBAC: USER, ADMIN roles

## GraphQL Schema

### Mutations
- `register(input: RegisterInput!)` → `AuthPayload!`
- `verifyOtp(email: String!, code: String!)` → `Boolean!`
- `login(input: LoginInput!)` → `AuthPayload!`
- `refreshToken(refreshToken: String!)` → `AuthPayload!`
- `enable2fa(secret: String!, code: String!)` → `Boolean!`
- `submitKyc(input: KycInput!)` → `User!`
- `cashIn(input: CashInInput!)` → `Transaction!`
- `cashOut(input: CashOutInput!)` → `Transaction!`
- `sendMoney(input: SendMoneyInput!)` → `Transaction!`
- `requestQrPayment(input: QrPaymentInput!)` → `String!`
- `addFavorite(accountName: String!, accountNumber: String!)` → `Favorite!`

### Queries
- `wallet` → `Wallet!`
- `transactions(pagination, filter)` → `TransactionConnection!`
- `transaction(id: UUID!)` → `Transaction`
- `statement(from: DateTime!, to: DateTime!)` → `[Transaction!]!`
- `notifications(pagination)` → `NotificationConnection!`
- `favorites` → `[Favorite!]!`

### Subscriptions
- `walletBalance(userId: UUID!)` → `Money!`
- `transactionStatus(transactionId: UUID!)` → `Transaction!`
- `notifications(userId: UUID!)` → `Notification!`

## Frontend

### Pages
- Login, Register, VerifyOtp
- Dashboard (balance, quick actions, recent transactions)
- Wallet (full details, statement)
- SendMoney, CashIn, CashOut, QrPayment
- Transactions (paginated, filtered)
- Profile (edit, 2FA, KYC)
- Notifications
- Admin Dashboard

### State Management
- Auth: React Context (token, user, login/logout)
- Server state: React Query (auto-caching, refetching, optimistic updates)
- GraphQL: Apollo Client for subscriptions
- Forms: React Hook Form + Zod
- UI: Material UI + Tailwind CSS

## Docker Services
- postgres (PostgreSQL 17 + pgdata volume)
- redis (Redis 7 + redisdata volume)
- rabbitmq (RabbitMQ 4 + rabbitmqdata volume)
- backend (FastAPI on 8000)
- frontend (React + Vite on 5173/dev, nginx-served static/prod)
- celery-worker (Celery async tasks)
- celery-beat (Celery scheduled tasks)
- nginx (Reverse proxy on 80/443)
- pgadmin (DB admin on 5050)
- prometheus (Metrics on 9090)
- grafana (Dashboards on 3001)
- loki (Log aggregation on 3100)
- promtail (Log shipping)
- mailpit (Email testing on 8025 UI / 1025 SMTP)

### Networks
- frontend_net (frontend + nginx)
- backend_net (backend + DB + cache + queue)
- monitoring_net (prometheus + grafana + loki)

## Monitoring
- Prometheus scrapes FastAPI /metrics endpoint
- Grafana dashboards for request latency, error rates, queue depth, transaction volume
- Loki + Promtail for centralized container log aggregation

## Testing
- Unit tests: pytest + pytest-asyncio + mocked dependencies
- Integration tests: test PostgreSQL container, full round-trip
- API tests: GraphQL mutation/query testing with test client
- Security tests: rate limiting, auth bypass attempts