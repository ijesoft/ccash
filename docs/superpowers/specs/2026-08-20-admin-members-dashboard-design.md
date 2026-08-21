# Admin Members Dashboard

## Goal
Add a members list to the existing admin dashboard (`/admin`) so admins can view all registered users with their wallet details.

## Access
- Admin-only (uses existing `require_admin` middleware)

## Backend

### New GraphQL type: `AdminMemberType`
```python
@strawberry.type
class AdminMemberType:
    id: str
    email: str
    role: str
    status: str
    wallet_balance_cents: int
    wallet_status: str
    created_at: str
```

### Updated resolver: `admin_users`
- Joins `User` with `Wallet` in a single query (avoids N+1)
- Returns `AdminMemberType` with wallet info included
- Supports `limit` and `offset` pagination params

### Service change: `AdminService.list_users`
- Add LEFT JOIN on `Wallet` table
- Return wallet balance and status alongside user data

## Frontend

### New GraphQL query: `GET_ADMIN_MEMBERS`
```graphql
query AdminMembers($limit: Int, $offset: Int) {
  adminUsers(limit: $limit, offset: $offset) {
    id email role status
    walletBalanceCents walletStatus
    createdAt
  }
}
```

### Updated `AdminDashboard.tsx`
1. Wire stat cards to `platformStats` query (replace `"--"` placeholders)
2. Add MUI DataGrid below stats with columns:
   - Email
   - Role (chip badge)
   - Status (chip badge)
   - Balance (formatted peso amount)
   - Joined (formatted date)
3. Server-side pagination via `limit`/`offset`

## Files to modify
- `backend/app/domains/admin/graphql.py` — new type, update resolver
- `backend/app/domains/admin/service.py` — join wallet in list_users
- `frontend/src/graphql/queries/admin.ts` — new queries file
- `frontend/src/pages/AdminDashboard.tsx` — wire stats + add table
