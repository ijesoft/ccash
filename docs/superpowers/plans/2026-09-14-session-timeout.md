# Session Inactivity Timeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GCash-like 5-minute inactivity auto-logout with a 60-second warning, enforced frontend + backend.

**Architecture:** Backend stamps `activity:{token_id}` and `activity:user:{user_id}` in Redis on login/refresh and rejects `refresh_token` when idle exceeds the timeout; frontend tracks real user events, shows a countdown dialog at 4 minutes, and calls `touchSession` on "Stay logged in".

**Tech Stack:** FastAPI / Strawberry GraphQL / Redis, React 19 / Apollo Client 3 / MUI, pytest, tsc.

---

### Task 1: Backend — inactivity setting + activity helpers

**Files:**
- Modify: `backend/app/config.py`
- Modify: `backend/app/domains/auth/service.py`
- Test: `backend/tests/test_session_timeout.py` (new, self-contained `FakeRedis`, no new deps)

- [x] **Step 1: Write the failing test** — idle refresh rejected, touch resets clock, active refresh rotates.
- [x] **Step 2: Implement** — `inactivity_timeout_minutes = 5`; `_stamp_activity` on login/refresh; `_check_idle` in `refresh_token`; `touch(user_id)`; activity cleanup in `logout`.
- [ ] **Step 3: Run test to verify it passes**

Run: `cd backend && ./.venv/bin/python -m pytest tests/test_session_timeout.py -v`
Expected: PASS (3 tests)

### Task 2: Backend — `touchSession` mutation

**Files:**
- Modify: `backend/app/domains/auth/graphql.py` (`AuthMutations.touch_session`)

- [x] **Step 1: Implement** — requires auth context, calls `service.touch(str(context.user_id))`, maps `AuthenticationError` to `Exception`, closes session in `finally` (repo GraphQL pattern).
- [ ] **Step 2: Verify** — covered by Task 1 tests + manual `touchSession` after 6 min idle returns "Session expired due to inactivity".

### Task 3: Frontend — `useIdleTimeout` hook

**Files:**
- Create: `frontend/src/hooks/useIdleTimeout.ts`

- [x] **Step 1: Implement** — warn timer (4 min) + expire timer (5 min); real DOM events only (Apollo 20s polls never reset it); 1s throttle; cross-tab sync via `localStorage` `ccash:lastActivity` + `storage` event; skips when disabled.

### Task 4: Frontend — dialog + wiring

**Files:**
- Create: `frontend/src/components/SessionTimeoutDialog.tsx`
- Create: `frontend/src/components/SessionGuard.tsx`
- Modify: `frontend/src/App.tsx`, `frontend/src/graphql/client.ts`, `frontend/src/graphql/mutations/auth.ts`, `frontend/src/pages/Login.tsx`

- [x] **Step 1: Implement** — MUI warning dialog with live countdown; `SessionGuard` mounted under `AuthProvider`; "Stay" calls `touchSession` (falls back to logout on failure); Apollo `errorLink` catches server-side expiry and redirects; `Login` shows "Session expired due to inactivity" for `?reason=session-expired`.
- [ ] **Step 2: Verify** — `cd frontend && npx tsc --noEmit && npm run build`, manual idle test per Task 5.

### Task 5: Full verification

- [ ] Run: `cd backend && ./.venv/bin/python -m pytest` — 88 existing + 3 new PASS.
- [ ] Manual: idle 4 min → dialog with 60s countdown → Stay resets; full 5 min → `/login?reason=session-expired`; second tab follows; refresh after 6 min idle rejected.
- [ ] Restart: `pm2 restart ccash-backend && cd frontend && npm run build && pm2 restart ccash-frontend`.

**Status:** Implemented 2026-09-14. Backend syntax-checked (`py_compile` OK). Full pytest/tsc blocked in this environment (no venv, no `node_modules`); run Task 5 commands on the dev host before demo.
