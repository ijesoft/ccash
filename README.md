# CCash - Digital Wallet Platform

A production-ready digital wallet platform built with Python 3.13 + FastAPI + Strawberry GraphQL + React 19 + PostgreSQL 17, running entirely via Docker Compose.

## Quick Start

Application processes run under PM2 on the host; stateful infrastructure runs in
Docker. `docker-compose.yml` (the all-in-Docker variant) is not the deployment
that serves the app — use `docker-compose.infra.yml` plus PM2.

```bash
cp .env.example .env
docker compose -f docker-compose.infra.yml up -d   # postgres, redis, rabbitmq, mailpit
pm2 start ecosystem.config.js                      # backend, celery, frontend
cd backend && ./.venv/bin/python -m alembic -c migrations/alembic.ini upgrade head
```

Access:
- **Frontend**: http://localhost:8830
- **GraphQL**: http://localhost:8830/api/graphql (proxied) or http://localhost:8831/graphql (direct)
- **Mailpit**: http://localhost:8025

## Seed Data

Run the seed script to create test users:

```bash
cd backend && ./.venv/bin/python -m app.seed
```

| User | Email | Password |
|------|-------|----------|
| Admin | admin@ccash.ph | Admin123! |
| Alice | alice@ccash.ph | Alice123! |
| Bob | bob@ccash.ph | Bob123! |

## Architecture

```
                    Nginx (Reverse Proxy)
                    ┌─────┴─────┐
               React App    FastAPI + GraphQL
                    │              │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
         PostgreSQL    Redis       RabbitMQ
                           │
                     Celery Workers
```

## Tech Stack

- **Backend**: Python 3.13, FastAPI, Strawberry GraphQL, SQLModel, Celery
- **Frontend**: React 19, TypeScript, Vite, MUI, Tailwind, Apollo Client, React Query
- **Database**: PostgreSQL 17, Redis 7
- **Queue**: RabbitMQ, Celery
- **Monitoring**: Prometheus, Grafana, Loki, Promtail
- **Infrastructure**: Docker Compose

## Features

- User registration with email OTP or authenticator-app verification
- Login with optional 2FA (TOTP)
- KYC document upload and verification (does not yet affect wallet limits)
- Wallet management with a stored transaction PIN (not yet enforced on transfers)
- Send money between wallets — idempotent, amount-validated, with a customer-facing reference
- Cash in / Cash out (simulated)
- Transaction history with per-viewer direction and masked counterparty
- Real-time notifications via WebSocket, fanned out across workers over Redis pub/sub
- Admin dashboard with user management

Not yet implemented: QR payments (the page exists but calls a mutation the schema
does not define, so it is unrouted), Request Money, Bills Payment, Buy Load, bank
transfer, tiered limits by KYC level, and transaction fees.

## Testing

```bash
cd backend && ./.venv/bin/python -m pytest                 # 51 tests
./backend/.venv/bin/python scripts/verify_realtime.py      # live WebSocket push
```

## GraphQL API

The API is available at `/api/graphql`. Key operations:

```graphql
# Mutations
register(email: String!, phone: String!, password: String!): UserType!
login(email: String!, password: String!, otpCode: String): AuthPayload!
sendMoney(input: SendMoneyInput!): TransactionType!
cashIn(input: CashInInput!): TransactionType!
cashOut(input: CashOutInput!): TransactionType!

# Queries
wallet: WalletType!
transactions(limit: Int, offset: Int, txType: String): TransactionConnection!
notifications(limit: Int, offset: Int): NotificationConnection!

# Every TransactionType carries a per-caller view of the row:
#   direction: IN | OUT          — resolved against the caller's wallet
#   counterparty { name maskedMobile }  — the other party, or null for cash in/out
#   reference: String            — customer-facing, e.g. "CC260726H7K2QP3M"
# Clients must render sign and colour from `direction`, never from `type`:
# one SEND row is OUT for the sender and IN for the recipient.

# Subscriptions
walletBalance(userId: UUID!): Money!
notifications(userId: UUID!): Notification!
```

## Project Structure

```
ccash/
├── backend/          # FastAPI + GraphQL backend
│   ├── app/
│   │   ├── domains/  # DDD modules (auth, wallets, transactions, etc.)
│   │   ├── graphql/  # Root schema and middleware
│   │   ├── core/     # Config, security, errors
│   │   └── tasks/    # Celery background tasks
│   └── migrations/   # Alembic database migrations
├── frontend/         # React + Vite frontend
│   └── src/
│       ├── pages/    # Route pages
│       ├── components/ # Reusable UI components
│       └── hooks/    # React hooks
├── docker/           # Docker configs (nginx, prometheus, grafana, etc.)
└── docker-compose.yml
```

## Security

- Passwords hashed with Argon2id
- JWT access (15min) + refresh tokens (7 days)
- TOTP-based 2FA
- Idempotency keys for all financial mutations, safe under concurrent double-submit
- Amount policy enforced in the service layer, backstopped by DB CHECK constraints
- Ownership checks on transaction reads
- Counterparty mobile numbers masked
- CORS restricted to frontend origin
- Soft delete

Known gaps: the `audit_logs` table exists but nothing writes to it; the rate
limiter keys on `request.client.host` (one shared bucket behind a proxy) and
selects its limit from the client-supplied `operationName`, so the stricter auth
limit is bypassed by omitting that field. The transaction PIN is stored but not
required for transfers.