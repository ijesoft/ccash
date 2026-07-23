# CCash - Digital Wallet Platform

A production-ready digital wallet platform built with Python 3.13 + FastAPI + Strawberry GraphQL + React 19 + PostgreSQL 17, running entirely via Docker Compose.

## Quick Start

```bash
cp .env.example .env
docker compose up -d
```

Access:
- **Frontend**: http://localhost
- **GraphQL Playground**: http://localhost/api/graphql
- **pgAdmin**: http://localhost/pgadmin (admin@ccash.ph / admin)
- **Mailpit**: http://localhost/mailpit
- **Grafana**: http://localhost:3001 (admin / admin)
- **Prometheus**: http://localhost:9090

## Seed Data

Run the seed script to create test users:

```bash
docker compose exec backend python -m app.seed
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

- User registration with OTP verification
- Login with optional 2FA (TOTP)
- KYC document upload and verification
- Wallet management with PIN protection
- Send money between wallets (idempotent)
- Cash in / Cash out (simulated)
- QR code payments
- Transaction history with filtering
- Real-time notifications via WebSocket
- Admin dashboard with user management

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
- Rate limiting via Redis
- Idempotency keys for all financial mutations
- CORS restricted to frontend origin
- Soft delete and audit logging