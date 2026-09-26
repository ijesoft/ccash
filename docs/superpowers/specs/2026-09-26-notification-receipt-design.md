# Notification → Receipt Design

**Status:** Approved 2026-09-26. **Next step:** implementation plan (writing-plans skill).

## Goal

Tapping a transaction-related notification opens its receipt in the existing
`TransactionReceiptDialog`. Notifications without a linked transaction
(`KYC_UPDATE`, `SECURITY`, legacy rows) behave exactly as today. No new
visual design: the receipt dialog and notification list are reused as-is.

## Context

- `backend/app/domains/transactions/service.py:_queue_notification` already
  stores `data = {transaction_id, reference, amount_cents}` on every money
  notification (`TRANSFER_RECEIVED`, `SENT`, `CASH_IN`, `CASH_OUT`,
  `QR_PAYMENT`).
- The GraphQL `NotificationType`
  (`backend/app/domains/notifications/graphql.py`) does **not** expose `data`,
  so the frontend cannot see the link. No DB migration is needed: the `data`
  JSON column already exists.
- `transaction(id)` (`backend/app/domains/transactions/graphql.py:191`)
  enforces ownership server-side and returns `null` for foreign or missing
  ids. It is the secure loader for the receipt.
- `TransactionReceiptDialog` takes a full `Transaction` object and is reused
  unchanged. The Notifications page renders purely from the
  `GET_NOTIFICATIONS` query (no websocket prepend path in the frontend).

## Decisions (user-confirmed)

1. Tap marks the notification read (existing behavior) **and** opens the
   receipt.
2. Rows with a viewable receipt show a small receipt icon; other rows are
   unchanged.
3. If the linked transaction cannot be loaded, skip the dialog silently —
   the item is still marked read.

## Backend

Add `transaction_id: str | None` to `NotificationType` in
`backend/app/domains/notifications/graphql.py`, resolved per row from
`n.data["transaction_id"]` when `data` is a dict containing it, else `None`.
Include the field in the `notifications` query item construction. No model,
repository, service, or migration changes. Add a pytest covering: a money
notification exposes its `transaction_id`; a `SECURITY` notification and a
row with `data=None` expose `None`.

## Frontend

- `frontend/src/graphql/queries/wallet.ts`: add `transactionId` to the
  `GET_NOTIFICATIONS` item selection.
- `frontend/src/types/index.ts`: add `transactionId: string | null` to the
  `Notification` interface.
- `frontend/src/pages/Notifications.tsx`:
  - Render a small receipt `IconButton`-less icon (decorative
    `ReceiptIcon`, `text.secondary`, trailing side) when
    `notif.transactionId` is present.
  - On row tap: run the existing mark-read flow unchanged; if
    `notif.transactionId` is present, fire a lazy `transaction(id)` query
    requesting the same fields as `GET_TRANSACTIONS` items, then set it as
    the `TransactionReceiptDialog` transaction. Reuse the existing `busyId`
    guard so a double-tap cannot fire two fetches.
  - On `null`/error result: open nothing (item stays marked read).
  - Mount `<TransactionReceiptDialog transaction={selected} onClose={...} />`
    the same way `Transactions.tsx:155` does.
  - New `GET_TRANSACTION_BY_ID` query lives in
    `frontend/src/graphql/queries/wallet.ts` next to `GET_TRANSACTIONS`.

## Edge cases

- Legacy notifications with no `data`: no icon, tap marks read only.
- Non-transaction types: unchanged rendering and behavior.
- Rapid double-tap: single fetch via `busyId` guard; dialog opens once.
- Deleted or foreign transaction id (should not occur, defense in depth):
  `transaction(id)` returns `null` → dialog skipped, read state kept.
- Unread badge counts: mark-read flow (optimistic update + refetches)
  unchanged, so counts behave as today.

## Verification

- `cd backend && ./.venv/bin/python -m pytest tests/test_notification_receipt.py -v`
  (new file, 3 tests) then full `pytest` — zero failures.
- `cd frontend && npx tsc --noEmit` and `npm run build` — clean.
- Manual: tap a transfer notification → receipt opens with correct amount,
  direction, counterparty; tap a security notification → no icon, marks
  read only; badge counts update; dialog share/image/PDF actions work from
  the notification-opened receipt.

## Out of scope

- Snapshot or field changes to notification `data` writes.
- Websocket push payload changes (frontend has no push-prepend path).
- Auto-opening receipts on notification arrival.
- Navigating to the Transactions page (dialog only, per request).
