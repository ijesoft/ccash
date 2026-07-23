# CCash Digital Wallet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-ready digital wallet platform (GCash-like) with auth, wallets, P2P transfers, cash in/out, QR payments, and notifications.

**Architecture:** Modular monolith with FastAPI + Strawberry GraphQL backend, React 19 + MUI + Tailwind frontend, PostgreSQL + Redis + RabbitMQ + Celery, all containerized via Docker Compose.

**Tech Stack:** Python 3.13, FastAPI, Strawberry GraphQL, SQLModel, PostgreSQL 17, Redis, Celery, RabbitMQ, React 19, TypeScript, Vite, Apollo Client, React Query, MUI, Tailwind, Docker Compose, Prometheus/Grafana/Loki.

---

### Task 1: Project Scaffold & Docker

**Files:**
- Create: `docker-compose.yml`
- Create: `docker-compose.prod.yml`
- Create: `.env.example`
- Create: `backend/Dockerfile`
- Create: `backend/.dockerignore`
- Create: `backend/requirements.txt`
- Create: `backend/app/__init__.py`
- Create: `backend/app/main.py`
- Create: `backend/app/config.py`
- Create: `backend/app/database.py`
- Create: `frontend/Dockerfile`
- Create: `frontend/.dockerignore`
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tailwind.config.js`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `docker/nginx/nginx.conf`
- Create: `docker/prometheus/prometheus.yml`
- Create: `docker/grafana/dashboards/`
- Create: `docker/loki/loki-config.yml`
- Create: `docker/promtail/promtail-config.yml`

- [ ] **Step 1: Create docker-compose.yml** with all services (postgres, redis, rabbitmq, backend, frontend, celery-worker, celery-beat, nginx, pgadmin, prometheus, grafana, loki, promtail, mailpit), networks (frontend_net, backend_net, monitoring_net), and volumes (pgdata, redisdata, rabbitmqdata, uploads, logs)

- [ ] **Step 2: Create backend Dockerfile** — multi-stage build: Python 3.13-slim, install requirements, copy app, expose 8000

- [ ] **Step 3: Create backend app skeleton** — `main.py` (FastAPI app with CORS, lifespan), `config.py` (pydantic-settings reading env vars), `database.py` (SQLModel engine + async session factory)

- [ ] **Step 4: Create frontend scaffold** — Vite + React 19 + TypeScript project with MUI, Tailwind, Apollo Client, React Router, React Query, Zod deps

- [ ] **Step 5: Create nginx config** — reverse proxy `/api` to backend, `/` to frontend static files, WebSocket upgrade for subscriptions

- [ ] **Step 6: Create monitoring configs** — Prometheus scrape config targeting backend:8000, Loki config for log aggregation, Promtail config for log shipping

- [ ] **Step 7: Create .env.example** with all env vars (DB URL, Redis URL, RabbitMQ URL, JWT secret, Mailpit SMTP, etc.)

- [ ] **Step 8: Verify `docker compose up -d`** starts all services

---

### Task 2: Database Models & Migrations

**Files:**
- Create: `backend/app/core/__init__.py`
- Create: `backend/app/core/security.py`
- Create: `backend/app/core/errors.py`
- Create: `backend/app/domains/auth/models.py`
- Create: `backend/app/domains/wallets/models.py`
- Create: `backend/app/domains/transactions/models.py`
- Create: `backend/app/domains/notifications/models.py`
- Create: `backend/app/domains/admin/__init__.py`
- Create: `backend/migrations/env.py`
- Create: `backend/migrations/alembic.ini`
- Create: `backend/migrations/versions/001_initial.py`

- [ ] **Step 1: Define User model** — SQLModel table: id (UUID, PK), email (unique, indexed), phone (unique, indexed), password_hash, status (enum: PENDING/ACTIVE/SUSPENDED), kyc_level (enum: NONE/BASIC/FULL), device_id, totp_secret, is_2fa_enabled, is_verified, created_at, updated_at, deleted_at, version, created_by, updated_by

- [ ] **Step 2: Define Wallet model** — SQLModel table: id (UUID, PK), user_id (FK→users), balance_cents (BIGINT, default 0), currency (default 'PHP'), status (enum: ACTIVE/FROZEN/CLOSED), pin_hash, daily_send_limit_cents, daily_send_used_cents, created_at, updated_at, deleted_at, version

- [ ] **Step 3: Define Transaction model** — SQLModel table: id (UUID, PK), idempotency_key (unique, indexed), type (enum: CASH_IN/CASH_OUT/SEND/RECEIVE/QR_PAYMENT), status (enum: PENDING/SUCCESS/FAILED/REVERSED), sender_wallet_id (FK→wallets, nullable), receiver_wallet_id (FK→wallets, nullable), amount_cents (BIGINT), fee_cents (BIGINT, default 0), net_amount_cents, reference, description, metadata (JSONB), created_at, updated_at, created_by

- [ ] **Step 4: Define Notification model** — SQLModel table: id (UUID, PK), user_id (FK→users), type (enum), title, body, is_read (default false), metadata (JSONB), created_at

- [ ] **Step 5: Define AuditLog model** — id (UUID, PK), user_id (nullable), action, resource_type, resource_id, old_values (JSONB), new_values (JSONB), ip_address, user_agent, created_at

- [ ] **Step 6: Setup Alembic** — configure env.py with async SQLModel metadata, create initial migration

- [ ] **Step 7: Create seed data migration** — insert admin user + default wallets + sample transactions for development

---

### Task 3: Auth Module — Backend

**Files:**
- Create: `backend/app/domains/auth/repository.py`
- Create: `backend/app/domains/auth/service.py`
- Create: `backend/app/domains/auth/graphql.py`
- Create: `backend/app/domains/auth/schemas.py`
- Create: `backend/app/graphql/__init__.py`
- Create: `backend/app/graphql/schema.py`
- Create: `backend/app/graphql/scalars.py`
- Create: `backend/app/graphql/middleware.py`

- [ ] **Step 1: Implement security utilities** in `core/security.py`: `hash_password()` (Argon2id), `verify_password()`, `create_access_token()` (JWT, 15min exp), `create_refresh_token()` (JWT, 7 day exp, stored in Redis), `decode_token()`, `generate_totp_secret()`, `verify_totp()`

- [ ] **Step 2: Implement Auth repository** — `get_by_email()`, `get_by_phone()`, `create()`, `update()`, `verify_email()`

- [ ] **Step 3: Implement Auth service** — `register()` (validate, hash password, create user, send OTP), `verify_otp()` (mark email verified, activate user), `login()` (verify password, check 2FA, create session, issue tokens), `refresh_token()` (validate refresh token in Redis, issue new pair), `enable_2fa()` (verify TOTP code, save secret), `logout()` (revoke refresh token)

- [ ] **Step 4: Implement GraphQL auth mutations** — `register`, `verifyOtp`, `login`, `refreshToken`, `enable2fa`, and query `me`

- [ ] **Step 5: Implement GraphQL auth middleware** — extract JWT from Authorization header, attach user to context, RBAC permission checks

- [ ] **Step 6: Create root GraphQL schema** combining all domain schemas

- [ ] **Step 7: Write unit tests** — test password hashing, JWT creation/verification, register flow, login flow, OTP verification, 2FA enable/verify, refresh token rotation

- [ ] **Step 8: Write integration tests** — full register→verify→login→refresh→logout cycle against test PostgreSQL

---

### Task 4: Wallet Module — Backend

**Files:**
- Create: `backend/app/domains/wallets/repository.py`
- Create: `backend/app/domains/wallets/service.py`
- Create: `backend/app/domains/wallets/graphql.py`
- Create: `backend/app/domains/wallets/schemas.py`

- [ ] **Step 1: Implement Wallet repository** — `get_by_user_id()`, `get_for_update()` (SELECT FOR UPDATE), `create()`, `update_balance()`, `update_daily_limit_usage()`

- [ ] **Step 2: Implement Wallet service** — `create_wallet()` (auto-create on first login), `get_wallet()`, `freeze_wallet()`, `close_wallet()`, `change_pin()` (hash with Argon2), `verify_pin()` (for transaction authorization)

- [ ] **Step 3: Implement GraphQL wallet queries** — `wallet` (current user's wallet), `favorites`

- [ ] **Step 4: Write unit tests** — wallet creation, balance read, PIN verification, freeze/unfreeze, daily limit tracking

- [ ] **Step 5: Write integration tests** — wallet creation on user activation, SELECT FOR UPDATE locking behavior, concurrent balance read safety

---

### Task 5: Transaction Module — Backend

**Files:**
- Create: `backend/app/domains/transactions/repository.py`
- Create: `backend/app/domains/transactions/service.py`
- Create: `backend/app/domains/transactions/graphql.py`
- Create: `backend/app/domains/transactions/schemas.py`

- [ ] **Step 1: Implement Transaction repository** — `create()`, `get_by_id()`, `get_by_idempotency_key()`, `list_by_wallet()` (paginated, with filters for type/date/status), `get_statement()` (date range)

- [ ] **Step 2: Implement Transaction service — send_money()**:
  ```
  1. Start DB transaction with SERIALIZABLE isolation
  2. Check idempotency key (return existing if duplicate)
  3. Lock sender wallet with SELECT FOR UPDATE
  4. Lock receiver wallet with SELECT FOR UPDATE
  5. Validate: sender status=ACTIVE, receiver status=ACTIVE, sufficient balance, daily limit not exceeded
  6. Create Transaction record (status=PENDING)
  7. Debit sender: UPDATE wallets SET balance_cents = balance_cents - amount_cents
  8. Credit receiver: UPDATE wallets SET balance_cents = balance_cents + amount_cents
  9. Update sender daily_send_used_cents
  10. Set Transaction status=SUCCESS
  11. Publish RabbitMQ event for notification
  12. Commit
  ```

- [ ] **Step 3: Implement cash_in()** — simpler: single wallet, admin/partner source, same atomic pattern with idempotency

- [ ] **Step 4: Implement cash_out()** — debit wallet, record transaction, same atomic pattern

- [ ] **Step 5: Implement QR payment** — `generate_qr_code()` returns encoded payment data (wallet_id, amount, reference), `scan_qr_payment()` decodes and executes send

- [ ] **Step 6: Implement Transaction GraphQL** — `sendMoney`, `cashIn`, `cashOut`, `requestQrPayment` mutations; `transactions` (paginated, filtered), `transaction(id)`, `statement(dateRange)` queries; `transactionStatus` subscription

- [ ] **Step 7: Write unit tests** — send money success, insufficient funds, idempotency (same key returns same result), daily limit exceeded, concurrent transfer safety, cash in/out, QR payment encode/decode

- [ ] **Step 8: Write integration tests** — full send money flow against real DB, concurrent transfer race condition testing, idempotency key dedup across restarts

---

### Task 6: Notifications Module — Backend

**Files:**
- Create: `backend/app/domains/notifications/repository.py`
- Create: `backend/app/domains/notifications/service.py`
- Create: `backend/app/domains/notifications/graphql.py`
- Create: `backend/app/tasks/__init__.py`
- Create: `backend/app/tasks/celery_app.py`
- Create: `backend/app/tasks/notifications.py`
- Create: `backend/app/websocket/__init__.py`
- Create: `backend/app/websocket/manager.py`

- [ ] **Step 1: Implement Notification repository** — `create()`, `list_by_user()` (paginated), `mark_read()`, `mark_all_read()`

- [ ] **Step 2: Implement Notification service** — `send_notification(user_id, type, title, body, metadata)` creates DB record + pushes via WebSocket

- [ ] **Step 3: Configure Celery** — `celery_app.py` with RabbitMQ broker + Redis result backend, Celery Beat schedule for periodic tasks (e.g., daily limit reset)

- [ ] **Step 4: Create Celery notification task** — `send_email_notification()` via Mailpit SMTP

- [ ] **Step 5: Implement WebSocket manager** — handles connections per user_id, broadcasts notifications, wallet balance updates, transaction status changes

- [ ] **Step 6: Wire transaction events to notifications** — in TransactionService, after successful commit, publish message to RabbitMQ exchange → consumed by Celery to create notification + push WebSocket

- [ ] **Step 7: Implement GraphQL notification queries/subscriptions** — `notifications` query (paginated), `markNotificationRead` mutation, `notifications` subscription

- [ ] **Step 8: Write tests** — notification creation, WebSocket connection/disconnect, Celery task execution, email sending via Mailpit

---

### Task 7: Favorites Module

**Files:**
- Create: `backend/app/domains/transactions/favorites.py`

- [ ] **Step 1: Create Favorite table** — id, user_id (FK→users), name, account_identifier (phone/email/wallet_id), created_at

- [ ] **Step 2: Implement Favorite repository + service** — CRUD operations

- [ ] **Step 3: Implement GraphQL** — `addFavorite`, `removeFavorite` mutations, `favorites` query

---

### Task 8: Frontend — Auth Pages

**Files:**
- Create: `frontend/src/graphql/client.ts`
- Create: `frontend/src/graphql/mutations/auth.ts`
- Create: `frontend/src/graphql/queries/auth.ts`
- Create: `frontend/src/context/AuthContext.tsx`
- Create: `frontend/src/hooks/useAuth.ts`
- Create: `frontend/src/pages/Login.tsx`
- Create: `frontend/src/pages/Register.tsx`
- Create: `frontend/src/pages/VerifyOtp.tsx`
- Create: `frontend/src/components/Layout.tsx`
- Create: `frontend/src/components/ProtectedRoute.tsx`
- Create: `frontend/src/types/index.ts`
- Create: `frontend/src/utils/format.ts`
- Create: `frontend/src/utils/validation.ts`

- [ ] **Step 1: Set up Apollo Client** — connect to GraphQL endpoint, attach JWT from localStorage to Authorization header, handle 401 → redirect login

- [ ] **Step 2: Implement AuthContext** — stores user, accessToken, refreshToken; provides login/logout/refresh functions; persists tokens in localStorage; auto-refreshes on 401

- [ ] **Step 3: Build Login page** — email/phone input, password input, 2FA TOTP input (conditional), form validation with Zod, error display, redirect to dashboard on success

- [ ] **Step 4: Build Register page** — email, phone, password, confirm password with Zod validation; submit → redirect to OTP verification

- [ ] **Step 5: Build VerifyOtp page** — 6-digit OTP input, submit, auto-redirect to login on success

- [ ] **Step 6: Build Layout component** — MUI AppBar + Drawer (sidebar nav), user menu, responsive (mobile bottom nav, desktop sidebar)

- [ ] **Step 7: Build ProtectedRoute** — checks AuthContext, redirects to /login if unauthenticated, shows loading spinner while refreshing token

- [ ] **Step 8: Wire up React Router** — routes: `/login`, `/register`, `/verify-otp`, `/` (protected dashboard), `/wallet`, `/send`, `/transactions`, `/notifications`, `/profile`

---

### Task 9: Frontend — Wallet & Transactions

**Files:**
- Create: `frontend/src/graphql/queries/wallet.ts`
- Create: `frontend/src/graphql/mutations/transactions.ts`
- Create: `frontend/src/hooks/useWallet.ts`
- Create: `frontend/src/hooks/useNotifications.ts`
- Create: `frontend/src/components/BalanceCard.tsx`
- Create: `frontend/src/components/TransactionList.tsx`
- Create: `frontend/src/components/AmountInput.tsx`
- Create: `frontend/src/components/PinInput.tsx`
- Create: `frontend/src/components/QrScanner.tsx`
- Create: `frontend/src/components/QrDisplay.tsx`
- Create: `frontend/src/pages/Dashboard.tsx`
- Create: `frontend/src/pages/Wallet.tsx`
- Create: `frontend/src/pages/SendMoney.tsx`
- Create: `frontend/src/pages/CashIn.tsx`
- Create: `frontend/src/pages/CashOut.tsx`
- Create: `frontend/src/pages/QrPayment.tsx`
- Create: `frontend/src/pages/Transactions.tsx`
- Create: `frontend/src/pages/Profile.tsx`
- Create: `frontend/src/pages/Notifications.tsx`
- Create: `frontend/src/hooks/useTransactions.ts`

- [ ] **Step 1: Build Dashboard** — BalanceCard (prominent balance + currency), quick action buttons (Send, Cash In, Cash Out, QR Pay), Recent Transactions list (last 5), notification badge

- [ ] **Step 2: Build BalanceCard** — animated balance display, eye toggle (show/hide), daily limit progress

- [ ] **Step 3: Build SendMoney page** — recipient input (search by phone/email), AmountInput component with PHP formatting, confirmation screen with fee breakdown, PIN modal authorization, success animation

- [ ] **Step 4: Build AmountInput** — numeric input with PHP prefix, comma formatting, max button, validation (min/max)

- [ ] **Step 5: Build PinInput** — modal overlay, 4-6 digit PIN input, error shake animation, submit to backend

- [ ] **Step 6: Build CashIn page** — select amount, confirm, success screen with reference number (simulated)

- [ ] **Step 7: Build CashOut page** — select amount, PIN confirmation

- [ ] **Step 8: Build QrPayment page** — "Scan QR" mode (camera scan via qr-scanner library) and "Show QR" mode (display your QR code for others to scan)

- [ ] **Step 9: Build Transactions page** — paginated list with MUI Table, filters by type/date range/status, search by reference, click to expand detail

- [ ] **Step 10: Build Wallet page** — full balance, statement date range picker, daily limit usage

- [ ] **Step 11: Build Profile page** — view/edit email, phone; KYC level display with upgrade button; 2FA enable/disable; change PIN

- [ ] **Step 12: Build Notifications page** — list of notifications, unread badge in nav, mark as read, mark all read, real-time via WebSocket subscription

- [ ] **Step 13: Wire WebSocket subscriptions** — `useWallet` hook subscribes to `walletBalance`, `useNotifications` subscribes to `notifications` for real-time updates

---

### Task 10: KYC Module

**Files:**
- Create: `backend/app/domains/users/__init__.py`
- Create: `backend/app/domains/users/models.py`
- Create: `backend/app/domains/users/repository.py`
- Create: `backend/app/domains/users/service.py`
- Create: `backend/app/domains/users/graphql.py`

- [ ] **Step 1: Create KycDocument model** — id, user_id, document_type (enum: ID/SELFIE/PROOF_OF_ADDRESS), file_path, status (PENDING/APPROVED/REJECTED), rejection_reason, uploaded_at, reviewed_at, reviewed_by

- [ ] **Step 2: Implement KYC service** — `submit_kyc_document()` (save file + create record), `approve_kyc()` (admin), `reject_kyc()` (admin), `get_kyc_status()`

- [ ] **Step 3: Implement GraphQL** — `submitKyc` mutation (multipart upload), `kycStatus` query; admin mutations: `approveKyc`, `rejectKyc`

- [ ] **Step 4: Create frontend KYC page** (or integrate into Profile) — upload ID/selfie, progress indicator, status display

- [ ] **Step 5: Add file upload endpoint** — REST endpoint for file uploads (files stored in docker volume), served via nginx

---

### Task 11: Admin Dashboard

**Files:**
- Create: `backend/app/domains/admin/graphql.py`
- Create: `backend/app/domains/admin/service.py`
- Modify: `frontend/src/App.tsx` (admin routes)

- [ ] **Step 1: Implement Admin service** — `list_users()` (paginated, filterable), `get_user_detail()`, `suspend_user()`, `activate_user()`, `list_all_transactions()`, `get_platform_stats()` (total users, total wallets, total transactions, total volume)

- [ ] **Step 2: Implement GraphQL admin queries** — all require ADMIN role via RBAC middleware

- [ ] **Step 3: Create frontend Admin Dashboard page** — stats cards (users, transactions, volume), user management table, transaction monitoring table

---

### Task 12: Monitoring & Polish

**Files:**
- Create: `backend/app/middleware/__init__.py`
- Create: `backend/app/middleware/rate_limit.py`
- Create: `backend/app/middleware/audit.py`
- Create: `backend/app/core/metrics.py`

- [ ] **Step 1: Implement rate limiter middleware** — Redis-based sliding window counter, configurable per endpoint (5 req/min for login, 30 req/min for general)

- [ ] **Step 2: Implement audit logging middleware** — log all mutations to audit_logs table (user, action, resource, old/new values, IP, user agent)

- [ ] **Step 3: Add Prometheus metrics** — request count, request duration histogram, active users gauge, transaction counter, error counter, wallet balance gauge

- [ ] **Step 4: Configure Grafana dashboards** — pre-built dashboard JSON with panels for: request rate/latency, error rate, transaction throughput, active users, queue depth, DB connections

- [ ] **Step 5: Create comprehensive seed data** — 5 users with wallets, 50+ transactions across types, notifications, varied dates for testing

- [ ] **Step 6: Write API documentation** — README with architecture overview, API docs, docker compose instructions, environment setup

- [ ] **Step 7: End-to-end smoke test** — docker compose up → register user → verify OTP → login → cash in → send money → check transaction history → verify balance reflects → test idempotency

---

### Task 13: CI/CD Pipeline

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/cd.yml`

- [ ] **Step 1: Create CI workflow** — run `docker compose up -d`, run pytest in backend container, run frontend build, run lint (ruff for Python, eslint for TS)

- [ ] **Step 2: Create CD workflow** — build Docker images, push to registry (Docker Hub / GHCR), deploy (placeholder)