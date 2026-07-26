# CCash — Demo Readiness Investigation & Implementation Plan

**Date:** 2026-07-26
**Scope:** Assess CCash against GCash's core feature set (money transfer first) and produce a
prioritised plan to make the platform demo-ready for the client.
**Method:** Static review of `backend/app` + `frontend/src`, plus live end-to-end probing of the
running deployment (`localhost:8831` API, `localhost:8830` web).

> All balances/transactions touched during live probing were restored to the seeded state
> (Alice ₱5,000 / Bob ₱2,500 / Admin ₱100,000, daily usage reset, probe rows deleted).

---

## 1. Executive summary

The foundation is genuinely good: DDD-per-domain layering, cents-only money, idempotency keys,
`SELECT FOR UPDATE` on wallets, soft delete + optimistic locking, JWT + Argon2id + TOTP, WebSocket
plumbing, Prometheus/Grafana/Loki. The architecture will hold up to client questions.

The problem is that **the headline flow — money transfer — does not currently survive a live demo.**
Four issues will be visible within the first three minutes:

1. Sending money requires **pasting a raw wallet UUID**. No one in a GCash demo types
   `e0032f81-87b5-4035-bacc-0a337a0cd9d1`.
2. The **recipient's own history shows the incoming transfer as outgoing** — red, with a minus sign.
3. **The QR Payment page throws a GraphQL error** on submit. The mutation it calls does not exist.
4. **A negative amount drains the recipient's wallet.** Verified live: `amountCents: -100000` moved
   ₱1,000 *from* Bob *to* Alice and returned `status: SUCCESS`.

Plus one deployment gap: **no Celery worker and no Mailpit are running**, so registration OTP emails
are queued to RabbitMQ and never delivered.

Phase 0 + Phase 1 below (roughly 3–4 focused days) turn this into a transfer flow that reads as a
credible GCash equivalent. Phases 2–3 add the breadth and hardening the client will probe for.

---

## 2. What actually works today (verified live)

| Flow | Status | Notes |
|------|--------|-------|
| Login (email + password) | Works | JWT access + refresh, Argon2id |
| Login 2FA (TOTP, then email OTP fallback) | TOTP works | Email OTP path dead — no Celery worker |
| Registration | Partially | User row created; email OTP never sends. Authenticator-app tab is the only working verification path |
| Wallet query (balance, status, daily limit) | Works | |
| Send money (valid amount, valid wallet UUID) | Works | Balances move correctly, atomic, idempotent |
| Cash in / cash out | Works | Simulated, no gateway |
| Transaction history + pagination | Works | Direction rendering is wrong (see 3.2) |
| Statement by date range | Works | Query only, no export |
| Notifications (query, mark read, WebSocket) | Plumbing works | **Never fires for transfers** |
| KYC document submit / approve / reject | Works | Sets `kyc_level`, which then affects nothing |
| Admin stats + user list + suspend/activate | Works | |
| QR Payment | **Broken** | Mutation does not exist in schema |
| Favorites | Works | Stores a free-text `account_identifier`, unused by send flow |

---

## 3. Findings, by severity

Severity is judged by *demo impact*, not just engineering risk.

### P0 — Will break or embarrass the demo

#### 3.1 Negative amounts move money backwards (money-creation bug)

**Live proof:**
```
mutation { sendMoney(input:{receiverWalletId:"<bob>", amountCents:-100000,
                            idempotencyKey:"..."}) { status amount{cents} } }
→ { "status": "SUCCESS", "amount": { "cents": -100000 } }
Bob:   250000 → 155000   (debited)
Alice: 500000 → 595000   (credited)
```

**Cause:** `backend/app/domains/transactions/models.py:34` declares `amount_cents: int = Field(ge=0)`,
but Pydantic constraints are **not enforced on SQLModel `table=True` models** — they are treated as
column metadata only. There is no service-level guard either:
`service.py:53` checks `balance_cents < amount_cents`, which is trivially false for a negative amount,
and `service.py:56-58` compares against the daily limit, which a negative amount also passes.
`update_balance(sender, -amount_cents)` then *credits* the sender.

Same hole exists in `cash_in` (mints money) and `cash_out`.

**Fix:** explicit validation in `TransactionService` before any state change — `amount_cents` must be
a positive integer, at or above a floor (₱1) and at or below a per-transaction ceiling. Add a DB
`CHECK (amount_cents > 0)` constraint as the backstop, and drop the misleading `ge=` field args.

#### 3.2 The recipient sees incoming money as outgoing

A transfer writes **one** `Transaction` row with `type = SEND`
(`service.py:63-75`). Both parties read that same row via
`repository.py:37-39` (`sender_wallet_id == me OR receiver_wallet_id == me`).

`frontend/src/components/TransactionList.tsx:44` decides the sign from `tx.type`, not from the
viewer's relationship to the row:

```tsx
{["CASH_IN", "RECEIVE"].includes(tx.type) ? "+" : "-"}{formatMoney(tx.amount.cents)}
```

So Bob, who *received* ₱50, sees `-₱50.00` with a red `SEND` chip. Verified live.
The `RECEIVE` enum value exists and is never written.

**Fix (recommended):** make direction a server-side concern. Add a `direction` field
(`IN`/`OUT`) to `TransactionType` computed per viewer from the wallet in context, and a
`counterparty` field (name + masked mobile). The frontend then renders sign and colour from
`direction` and never re-derives it. This also sets up the receipt screen and avoids the
alternative of writing paired SEND/RECEIVE rows, which doubles the ledger and complicates
reconciliation.

#### 3.3 QR Payment page is non-functional

`frontend/src/pages/QrPayment.tsx:5-9` calls `scanQrPayment(data: String!)`.
Schema introspection of the live API returns no such mutation — the full mutation list is
`suspendUser, activateUser, register, setupVerifyTotp, verifyOtp, sendLoginOtp, login, refreshToken,
setup2fa, enable2fa, logout, submitKyc, approveKyc, rejectKyc, markNotificationRead,
markAllNotificationsRead, sendMoney, cashIn, cashOut, setPin, addFavorite, removeFavorite`.

Clicking **Pay** produces `Cannot query field "scanQrPayment"`. The "My QR Code" tab is a grey
placeholder div (`QrPayment.tsx:59-67`). `qr-scanner@1.4.2` is in `package.json` and never imported.

QR is a signature GCash feature and the tile sits on the dashboard. Either build it (Phase 2) or
remove the tile before the demo — do not leave it clickable.

#### 3.4 Transfer is addressed by wallet UUID, and no user has a name

`SendMoneyInput.receiver_wallet_id: str` (`transactions/graphql.py:72`) and the UI field is literally
labelled **"Recipient Wallet ID"** (`SendMoney.tsx:55`).

Worse, the `User` model (`auth/models.py:21-33`) has **no name fields at all** — only `email` and
`phone`. `UserType` exposes `id, email, phone, status, kycLevel, is2faEnabled, isVerified, createdAt`.
So there is currently no way to show "Send to Juan D." anywhere in the product.

This is the single largest "this is not GCash" gap. GCash's transfer is: enter mobile number →
**app confirms the recipient's name** → enter amount → enter MPIN → receipt with Ref No.

**Fix:** add `first_name` / `last_name` to `User`; resolve recipients by mobile number; add a
`resolveRecipient(mobile)` query returning masked name + masked number for the confirmation step.

#### 3.5 No Celery worker and no Mailpit running

`docker ps` shows only `ccash-postgres`, `ccash-redis`, `ccash-rabbitmq`. PM2 runs `ccash-backend`
(port 8831) and `ccash-frontend` (port 8830). There is no Celery worker process and no Mailpit
container.

Every `send_email_notification.delay(...)` — registration OTP (`auth/service.py:45`), login OTP
(`auth/service.py:102`) — enqueues to RabbitMQ with no consumer. Registration by email OTP cannot
complete. The `reset_daily_limits` beat task also never runs.

Note also that `AGENTS.md` and `README.md` document a Docker Compose deployment on port 80 with
Nginx, pgAdmin, Mailpit and Grafana. The live deployment is PM2 on 8830/8831 with no Nginx and no
Nginx site config. **Decide which one the demo runs on and make the docs match**, otherwise a client
following the README lands nowhere.

### P1 — Visibly missing polish

#### 3.6 No notification when money arrives

Verified: after a successful transfer, Bob's `unreadCount` is `0` and `notifications.items` is empty.
`grep -rn "Notification" backend/app/domains/transactions/` returns nothing — `NotificationService`
(which already writes a row *and* pushes over WebSocket, `notifications/service.py:15-35`) is never
called from the transaction flow.

The client will absolutely ask "does the recipient get notified?". The plumbing is done; it just
needs to be wired in. Highest value-per-hour item in the whole plan.

#### 3.7 No reference number, no receipt

`Transaction.reference` is never populated — live probe returned `"reference": null`. GCash shows a
Ref No. on every receipt and users screenshot it as proof of payment.
There is also no receipt/confirmation screen: `SendMoney.tsx:50` shows a green
`"Money sent successfully!"` alert and clears the form.

#### 3.8 PIN exists but never gates a transaction

`setPin` and `WalletService.verify_pin` (`wallets/service.py:37-44`) exist. `verify_pin` is not
exposed as a mutation and is not called from `send_money`, `cash_out`, or QR pay. Any valid access
token can drain a wallet with no second factor. In GCash the MPIN prompt is a defining part of the
transfer UX.

#### 3.9 Self-transfer allowed

Verified: Alice → Alice succeeded with `status: SUCCESS`. Creates a phantom balance-neutral row and
consumes daily limit. Needs an explicit guard.

### P2 — Correctness and credibility (client will ask; won't break the demo)

| # | Finding | Location |
|---|---------|----------|
| 3.10 | **KYC tiers do nothing.** Every wallet gets a ₱50,000 daily limit regardless of `kyc_level`. No wallet balance cap. GCash limits by tier. | `wallets/models.py:24`, `users/service.py:23-35` |
| 3.11 | **Fees hardcoded to zero** with a `# fee` comment. Real cash-out and InstaPay carry fees; a fee engine also demos well. | `transactions/service.py:60-61` |
| 3.12 | **`audit_logs` table is never written to** despite README claiming "audit logging". Model exists, zero call sites. | `core/audit.py`, no references |
| 3.13 | **Deadlock risk.** `send_money` locks receiver (`service.py:44`) *then* sender (`service.py:51`). Concurrent A→B and B→A can deadlock. Lock in deterministic UUID order. | `transactions/service.py:44-51` |
| 3.14 | **Idempotency race.** Check-then-insert with no `IntegrityError` handling. Concurrent double-submit → 500 instead of returning the existing tx. | `transactions/service.py:34-36` |
| 3.15 | **Rate limiter keyed on `request.client.host`.** Behind a proxy that is the proxy's IP, so every user shares one bucket. Auth limit of 5/min per IP will lock out a demo room on shared Wi-Fi. Also non-atomic (`get` then `incr`) and reads the request body in middleware. | `middleware/rate_limit.py:13,25-36` |
| 3.16 | **No tests at all.** `pytest`, `pytest-asyncio`, `pytest-cov`, `httpx` are in `requirements.txt`, unused. Every finding in this document would have been caught by one test file. | `backend/` |
| 3.17 | **`datetime.utcnow()` throughout** — deprecated in 3.12+, writes naive datetimes into `timezone=True` columns. | all `models.py` |
| 3.18 | **Admin assigns raw strings to enum fields** — `user.status = "SUSPENDED"`. | `admin/service.py:51,58` |
| 3.19 | `Money.amount: float` on the wire. Display-only so tolerable, but a client asking about float money will not like the answer. Prefer a formatted string. | `graphql/scalars.py:9` |
| 3.20 | `create_tables()` on startup alongside Alembic migrations — two sources of schema truth. | `main.py:20` |

---

## 4. Gap analysis vs GCash

| GCash feature | CCash today | Priority for demo |
|---|---|---|
| **Send Money to mobile number** | UUID only, no name confirmation | **P0** |
| **Recipient name confirmation before send** | Impossible — no name fields | **P0** |
| **MPIN on every transaction** | PIN stored, never enforced | **P1** |
| **Receipt with Ref No.** | No reference, no receipt screen | **P1** |
| **Push/in-app notification on receive** | Plumbing built, never called | **P1** |
| Request Money | Absent | P2 |
| **QR Ph — scan to pay** | Broken (missing mutation) | **P0 fix or hide** |
| **QR Ph — generate My QR** | Grey placeholder | P2 |
| Cash In (bank / outlet) | Simulated, single generic flow | P2 — add channel picker |
| Cash Out | Simulated, no fee | P2 |
| Bills Payment (biller categories) | Absent | P2 — high demo value |
| Buy Load (telco + denominations) | Absent | P2 — high demo value |
| Bank transfer (InstaPay / PESONet) | Absent, explicitly out of MVP scope | P3 |
| Split Bill | Absent | P3 |
| GSave / GInvest / GLoan / GInsure | Absent, out of scope | Out |
| Transaction history + filters | Works (direction bug) | P0 bugfix |
| Statement export (PDF/CSV) | Query only | P2 |
| Tiered limits by KYC | KYC captured, limits not applied | P2 |
| Favorites / saved recipients | Stored, not wired into send | P2 |
| Freeze / lost-phone lockout | `freeze_wallet` exists, not exposed | P3 |

**Reading of the matrix:** CCash is not short on architecture, it is short on the *last mile* of the
flows it already has. Six of the top nine gaps are wiring existing pieces together, not new
subsystems.

---

## 5. Implementation plan

Estimates assume one developer familiar with the codebase. Ordered so that stopping after any
phase still leaves a coherent, demoable product.

### Phase 0 — Stop the bleeding — **DELIVERED 2026-07-26**

Verified on the running deployment: **51 pytest tests pass**, **31/31 live API checks pass**, and the
live WebSocket push succeeds repeatedly under all 4 workers via the browser's port. The demo
database was restored to its seeded state afterwards (Alice ₱5,000 / Bob ₱2,500 / Admin ₱100,000,
4 transactions, 0 notifications).

Three further defects surfaced *during* the work, each caught by the new tests rather than by review:

1. **Migration 001 could never produce a working database.** It created
   `transactions.metadata` and `notifications.metadata`, but the models declare `tx_metadata` and
   `data` (`metadata` is reserved on a SQLAlchemy declarative class). It also created
   `notifications.type` as `VARCHAR(50)` where the model binds a Postgres enum. Any deploy from
   migrations — i.e. any real deploy — could not read the transactions table or write a
   notification. The live database worked only because it was built by `create_tables()`.
2. **Money was stored in `INTEGER` columns**, capping any balance at ₱21,474,836.47, where the
   design spec says BIGINT. Same cause: `create_tables()` follows the models, and the models
   declared plain `int`. Models now pin `BigInteger`; migration 003 widens deployed databases. A
   `create_all` schema and an `alembic upgrade head` schema now diff clean.
3. **Real-time notifications could not work under the actual deployment.** `ConnectionManager` held
   sockets in a per-process dict while `start-backend.sh` runs `uvicorn --workers 4`, so the worker
   handling a transfer almost never held the recipient's socket and every push was dropped silently.
   Confirmed by a single-worker control run. Pushes now fan out over Redis pub/sub
   (`ccash:ws:push`), and `scripts/verify_realtime.py` regression-tests it against a live server.

Also fixed, because it made the deployment untrustworthy:

- **`npm run build` shadowed its own sources.** `tsc -b` with no `noEmit`/`outDir` wrote a `.js`
  beside every `.tsx`; Vite resolves `.js` before `.tsx`, so each build compiled the *previous*
  build's output and stopped seeing source edits. `noEmit` is now set and the litter is gitignored.
  Left unfixed, a Phase 1 change could appear to have no effect.
- **Infra IPs are now pinned** in `docker-compose.infra.yml`. `backend/.env` addresses Postgres,
  Redis and RabbitMQ by IP on an undeclared subnet, so a container recreate would have reassigned
  addresses and silently detached the backend from its database.

Pulled forward from Phase 1 because the code was already open: deterministic wallet lock ordering
(1.8) and the `IntegrityError` path that makes a concurrent double-submit return the winning
transaction instead of a 500.

Also closed while in the resolvers: `transaction(id)` performed **no ownership check** — any
authenticated user could read any transaction by id. Now scoped to the caller's wallet, returning
`null` indistinguishably for "absent" and "not yours".

Original task list, all landed:

### Phase 0 task list — ~1 day

| # | Task | Files |
|---|------|-------|
| 0.1 | Validate amounts in `TransactionService` (positive int, min ₱1, max per-tx cap) for `send_money`, `cash_in`, `cash_out`. Add `CHECK (amount_cents > 0)` migration. Remove misleading `Field(ge=…)`. | `transactions/service.py`, `models.py`, new migration |
| 0.2 | Reject self-transfer (`sender_wallet_id == receiver_wallet_id`). | `transactions/service.py` |
| 0.3 | Add `direction` + `counterparty` to the GraphQL `TransactionType`, resolved per viewer. Render sign/colour from `direction` only. | `transactions/graphql.py`, `components/TransactionList.tsx` |
| 0.4 | Wire `NotificationService` into `send_money` / `cash_in` / `cash_out` — row + WebSocket push to both parties. | `transactions/service.py` |
| 0.5 | Generate a human-readable `reference` on every transaction (e.g. `CC26072600001234`). Expose it. | `transactions/service.py`, `graphql.py` |
| 0.6 | Decide the demo runtime. Either bring up Celery + Mailpit, or make email OTP synchronous/inline for the demo. Update `README.md` + `AGENTS.md` to match reality (ports 8830/8831, PM2). | `ecosystem.config.js`, docs |
| 0.7 | Either fix or hide the QR tile. Hiding is 10 minutes; leaving it clickable is a guaranteed on-stage error. | `pages/Dashboard.tsx` |
| 0.8 | First test file: `test_transactions.py` covering negative amount, self-send, insufficient funds, daily limit, idempotent replay. Locks 0.1–0.2 in place. | `backend/tests/` |

**Exit criterion — met.** Negative, zero, over-cap and self transfers rejected with specific
messages; recipient sees `+₱50.00` in green labelled `From 0918••••002`; both parties get a
notification and the recipient's socket receives it live; every transaction carries a reference like
`CC260726H7K2QP3M`; every dashboard action resolves without a GraphQL error.

Reproduce with:

```bash
cd backend && ./.venv/bin/python -m pytest              # 51 tests
./backend/.venv/bin/python scripts/verify_realtime.py   # live cross-worker push
```

### Phase 1 — Make transfer feel like GCash — ~2 days

| # | Task | Files |
|---|------|-------|
| 1.1 | Add `first_name`, `last_name` to `User` (migration + seed + `UserType`). | `auth/models.py`, migration, `seed.py` |
| 1.2 | `resolveRecipient(mobile: String!)` query → masked name + masked mobile + `walletId`. Rate-limit it (it's an enumeration surface — return a generic not-found, never leak whether a number is registered beyond what's needed). | new resolver in `wallets/` or `users/` |
| 1.3 | Accept `receiverMobile` on `SendMoneyInput` (keep `receiverWalletId` for back-compat). | `transactions/graphql.py`, `service.py` |
| 1.4 | `verifyPin` mutation; require PIN for `send_money` / `cash_out` above a threshold. Lock the wallet after N failed attempts (Redis counter). | `wallets/service.py`, `graphql.py`, `transactions/service.py` |
| 1.5 | Rebuild `SendMoney.tsx` as the GCash 4-step flow: **enter mobile → confirm recipient name → amount + note → MPIN → receipt**. | `pages/SendMoney.tsx`, new `components/` |
| 1.6 | Receipt component: amount, recipient, Ref No., timestamp, running balance, share/screenshot affordance. Reuse for cash in/out and QR. | new `components/Receipt.tsx` |
| 1.7 | Wire Favorites into the send flow — pick a saved recipient instead of typing. Store `wallet_id`, not free text. | `pages/SendMoney.tsx`, `wallets/models.py` |
| 1.8 | Deterministic lock ordering + `IntegrityError` → return existing tx on idempotency race. | `transactions/service.py` |

**Exit criterion:** a transfer can be demoed end to end by mobile number, with name confirmation,
MPIN, receipt, and a live notification on the recipient's screen — no UUIDs anywhere in the UI.

### Phase 2 — Breadth the client will ask about — ~3 days

| # | Task |
|---|------|
| 2.1 | **QR Ph:** `myQrCode` query returning a payload + `scanQrPayment` mutation that parses it and reuses the transfer path. Frontend: real QR render, and camera scan via the already-installed `qr-scanner`. |
| 2.2 | **Request Money:** `requestMoney` mutation + pending-request inbox + accept/decline (settles through the transfer path). Cheap, because it is a notification plus an approve action over existing machinery. |
| 2.3 | **Bills Payment:** `billers` catalogue (categories: electricity, water, telco, government, cable), `payBill` mutation, account-number validation per biller, fee per biller. Demos extremely well for modest effort. |
| 2.4 | **Buy Load:** telco detection from mobile prefix, denomination picker, `buyLoad` mutation. |
| 2.5 | **KYC-tiered limits:** map `kyc_level` → daily send limit, per-tx cap, wallet balance cap. Enforce in `TransactionService`. Surface "verify to raise your limit" in the UI. Makes the existing KYC module *mean* something. |
| 2.6 | **Fee engine:** per-type fee rules (cash-out %, bills convenience fee, free P2P), shown before confirmation and recorded in `fee_cents`. |
| 2.7 | **Cash-in channel picker** (bank, 7-Eleven, partner outlet) — cosmetic depth over the existing simulated flow. |
| 2.8 | **Statement export** — CSV and PDF over the existing `statement` query. |
| 2.9 | Dashboard restyle to a GCash-like mobile-first shell: balance hero, action grid, recent activity. Biggest perceived-quality gain per hour of the whole plan. |

### Phase 3 — Credibility & hardening — ~2 days

| # | Task |
|---|------|
| 3.1 | Test suite to ~80%: transaction invariants, auth/OTP/2FA, PIN lockout, KYC tier limits, idempotency under concurrency, GraphQL authz per resolver. |
| 3.2 | Populate `audit_logs` on every financial mutation and admin action; expose an admin audit view. |
| 3.3 | Rate limiter: key on authenticated user ID (fall back to `X-Forwarded-For`), atomic Lua/pipeline increment, per-operation limits, and raise the auth limit so a shared-IP demo room isn't locked out. |
| 3.4 | Replace `datetime.utcnow()` with `datetime.now(timezone.utc)`; fix `admin/service.py` enum assignment; drop `create_tables()` in favour of Alembic only. |
| 3.5 | Admin dashboard depth: transaction search, reverse/refund a transaction (`REVERSED` status is defined and unused), freeze/unfreeze wallet, KYC review queue. |
| 3.6 | Grafana dashboard the client can actually be shown: transaction volume, success rate, p95 latency, notification delivery. The stack is already running — it just needs one curated board. |
| 3.7 | `make demo-reset` — deterministic seed with named users, realistic transaction history, and a one-command reset between demo runs. |

---

## 6. Recommended demo script (post Phase 1)

1. Log in as Alice. Balance hero, action grid, recent activity with correct directions.
2. Send ₱500 to `0918-000-0003` → name confirmation "Bob S." → MPIN → receipt with Ref No.
3. Cut to Bob's screen, already open: notification arrives live over WebSocket; balance updates.
4. Bob's history shows `+₱500.00` green with "from Alice C." and the same Ref No.
5. Attempt to send more than the daily limit → clean, specific error.
6. (Phase 2) Pay a bill, buy load, scan a QR.
7. Admin dashboard: platform stats, user list, KYC queue, audit trail.
8. Grafana: live transaction volume and latency from the run just performed.

## 7. Two things to decide before work starts

1. **Demo runtime — PM2 or Docker Compose?** Everything in Phase 0.6 depends on this, and the docs
   currently describe a deployment that isn't the one running.
2. **Scope ceiling.** Phases 0–1 make the *existing* feature set demo-safe and GCash-credible.
   Phase 2 adds new features (bills, load, QR, request money) that widen the demo but do not deepen
   what's already there. If the client's question is "can it handle money transfer?", Phases 0–1 are
   the answer and Phase 2 is optional garnish. If it's "how close is this to GCash?", Phase 2 matters.
