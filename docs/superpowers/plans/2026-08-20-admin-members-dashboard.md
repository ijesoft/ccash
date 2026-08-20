# Admin Members Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a members list with stats to the admin dashboard at `/admin`, showing all registered users with their wallet details.

**Architecture:** Extend existing `adminUsers` resolver to join wallet data, wire up placeholder stat cards, and add a DataGrid table below.

**Tech Stack:** Python/FastAPI/Strawberry GraphQL (backend), React/MUI/TypeScript (frontend), PostgreSQL

## Global Constraints

- All money amounts in `_cents` BigInteger columns, never floats
- Amount validation via `validate_amount` in service layer
- Soft delete: `deleted_at` + `version` on all tables
- Session lifecycle: services call `session.commit()` explicitly
- GraphQL errors mapped from `app.core.errors` to `Exception(str(e))`
- Frontend: Apollo Client, TypeScript strict mode, MUI components

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `backend/app/domains/admin/service.py` | Modify | Join Wallet in `list_users` |
| `backend/app/domains/admin/graphql.py` | Modify | Add `AdminMemberType`, update resolver |
| `frontend/package.json` | Modify | Add `@mui/x-data-grid` dependency |
| `frontend/src/graphql/queries/admin.ts` | Create | Admin GraphQL queries |
| `frontend/src/pages/AdminDashboard.tsx` | Modify | Wire stats + add member table |

---

### Task 1: Backend — Extend AdminService with wallet join

**Files:**
- Modify: `backend/app/domains/admin/service.py`

**Interfaces:**
- Produces: `list_users()` returns `tuple[list[dict], int]` where each dict has user + wallet fields

- [ ] **Step 1: Add wallet import and update list_users**

```python
# backend/app/domains/admin/service.py
# Add to imports at top:
from app.domains.wallets.models import Wallet

# Replace list_users method:
async def list_users(self, limit: int = 20, offset: int = 0) -> tuple[list[dict], int]:
    total_result = await self.session.execute(select(func.count(User.id)))
    total = total_result.scalar() or 0

    result = await self.session.execute(
        select(User, Wallet)
        .outerjoin(Wallet, User.id == Wallet.user_id)
        .order_by(User.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    rows = result.all()
    members = []
    for user, wallet in rows:
        members.append({
            "id": str(user.id),
            "email": user.email,
            "role": user.role.value,
            "status": user.status.value,
            "wallet_balance_cents": wallet.balance_cents if wallet else 0,
            "wallet_status": wallet.status.value if wallet else "NONE",
            "created_at": user.created_at.isoformat() if user.created_at else "",
        })
    return members, total
```

- [ ] **Step 2: Commit backend service change**

```bash
cd /home/joeysabusido/ccash
git add backend/app/domains/admin/service.py
git commit -m "feat(admin): join wallet data in list_users for members dashboard"
```

---

### Task 2: Backend — Add AdminMemberType and update resolver

**Files:**
- Modify: `backend/app/domains/admin/graphql.py`

**Interfaces:**
- Consumes: `AdminService.list_users()` returns `tuple[list[dict], int]`
- Produces: `admin_users` resolver returns `list[AdminMemberType]`

- [ ] **Step 1: Add AdminMemberType and update resolver**

```python
# backend/app/domains/admin/graphql.py
# Add after PlatformStats type:

@strawberry.type
class AdminMemberType:
    id: str
    email: str
    role: str
    status: str
    wallet_balance_cents: int
    wallet_status: str
    created_at: str

# Update admin_users resolver in AdminQueries:
    @strawberry.field
    async def admin_users(self, info: Info, limit: int = 20, offset: int = 0) -> list[AdminMemberType]:
        require_admin(info.context)
        service = await get_admin_service(info)
        try:
            members, _ = await service.list_users(limit, offset)
            return [AdminMemberType(**m) for m in members]
        finally:
            await service.session.close()
```

- [ ] **Step 2: Commit backend graphql change**

```bash
cd /home/joeysabusido/ccash
git add backend/app/domains/admin/graphql.py
git commit -m "feat(admin): add AdminMemberType with wallet info for members list"
```

---

### Task 3: Frontend — Install MUI DataGrid and create admin queries

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/src/graphql/queries/admin.ts`

**Interfaces:**
- Produces: `GET_ADMIN_STATS`, `GET_ADMIN_MEMBERS` queries

- [ ] **Step 1: Install @mui/x-data-grid**

```bash
cd /home/joeysabusido/ccash/frontend
npm install @mui/x-data-grid
```

- [ ] **Step 2: Create admin queries file**

```typescript
// frontend/src/graphql/queries/admin.ts
import { gql } from "@apollo/client";

export const GET_ADMIN_STATS = gql`
  query PlatformStats {
    platformStats {
      totalUsers
      activeWallets
      totalTransactions
      transactionVolumeCents
    }
  }
`;

export const GET_ADMIN_MEMBERS = gql`
  query AdminMembers($limit: Int, $offset: Int) {
    adminUsers(limit: $limit, offset: $offset) {
      id
      email
      role
      status
      walletBalanceCents
      walletStatus
      createdAt
    }
  }
`;
```

- [ ] **Step 3: Commit frontend queries**

```bash
cd /home/joeysabusido/ccash
git add frontend/package.json frontend/package-lock.json frontend/src/graphql/queries/admin.ts
git commit -m "feat(admin): add admin GraphQL queries and install MUI DataGrid"
```

---

### Task 4: Frontend — Wire AdminDashboard with stats and members table

**Files:**
- Modify: `frontend/src/pages/AdminDashboard.tsx`

**Interfaces:**
- Consumes: `GET_ADMIN_STATS`, `GET_ADMIN_MEMBERS` queries

- [ ] **Step 1: Replace AdminDashboard.tsx content**

```tsx
// frontend/src/pages/AdminDashboard.tsx
import { useState } from "react";
import { Box, Typography, Card, CardContent, Grid, Chip } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useQuery } from "@apollo/client";
import { GET_ADMIN_STATS, GET_ADMIN_MEMBERS } from "../graphql/queries/admin";
import { formatMoney } from "../utils/format";

const columns: GridColDef[] = [
  { field: "email", headerName: "Email", flex: 1, minWidth: 200 },
  {
    field: "role",
    headerName: "Role",
    width: 100,
    renderCell: (params) => (
      <Chip
        label={params.value}
        color={params.value === "ADMIN" ? "primary" : "default"}
        size="small"
        variant="outlined"
      />
    ),
  },
  {
    field: "status",
    headerName: "Status",
    width: 120,
    renderCell: (params) => (
      <Chip
        label={params.value}
        color={params.value === "ACTIVE" ? "success" : params.value === "SUSPENDED" ? "error" : "warning"}
        size="small"
      />
    ),
  },
  {
    field: "walletBalanceCents",
    headerName: "Balance",
    width: 130,
    valueFormatter: (params) => formatMoney(params.value),
  },
  {
    field: "createdAt",
    headerName: "Joined",
    width: 160,
    valueFormatter: (params) => {
      if (!params.value) return "";
      return new Date(params.value).toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    },
  },
];

export default function AdminDashboard() {
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 10 });

  const { data: statsData, loading: statsLoading } = useQuery(GET_ADMIN_STATS);
  const { data: membersData, loading: membersLoading } = useQuery(GET_ADMIN_MEMBERS, {
    variables: {
      limit: paginationModel.pageSize,
      offset: paginationModel.page * paginationModel.pageSize,
    },
  });

  const stats = statsData?.platformStats;
  const members = membersData?.adminUsers ?? [];

  return (
    <Box>
      <Typography variant="h5" fontWeight="bold" mb={3}>Admin Dashboard</Typography>

      <Grid container spacing={3} mb={3}>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography variant="h4" fontWeight="bold">
                {statsLoading ? "--" : stats?.totalUsers ?? "--"}
              </Typography>
              <Typography variant="body2" color="text.secondary">Total Users</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography variant="h4" fontWeight="bold">
                {statsLoading ? "--" : stats?.activeWallets ?? "--"}
              </Typography>
              <Typography variant="body2" color="text.secondary">Active Wallets</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography variant="h4" fontWeight="bold">
                {statsLoading ? "--" : stats?.totalTransactions ?? "--"}
              </Typography>
              <Typography variant="body2" color="text.secondary">Total Transactions</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography variant="h4" fontWeight="bold">
                {statsLoading ? "--" : formatMoney(stats?.transactionVolumeCents ?? 0)}
              </Typography>
              <Typography variant="body2" color="text.secondary">Transaction Volume</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Typography variant="h6" fontWeight="bold" mb={2}>Members</Typography>
      <Box sx={{ height: 500, width: "100%" }}>
        <DataGrid
          rows={members}
          columns={columns}
          loading={membersLoading}
          rowCount={stats?.totalUsers ?? 0}
          paginationModel={paginationModel}
          onPaginationModelChange={setPaginationModel}
          paginationMode="server"
          pageSizeOptions={[5, 10, 25]}
          disableRowSelectionOnClick
          sx={{
            border: 1,
            borderColor: "divider",
            borderRadius: 2,
          }}
        />
      </Box>
    </Box>
  );
}
```

- [ ] **Step 2: Commit frontend dashboard**

```bash
cd /home/joeysabusido/ccash
git add frontend/src/pages/AdminDashboard.tsx
git commit -m "feat(admin): wire stats and add members DataGrid to admin dashboard"
```

---

### Task 5: Verify end-to-end

- [ ] **Step 1: Restart backend**

```bash
pm2 restart ccash-backend
```

- [ ] **Step 2: Rebuild frontend**

```bash
cd /home/joeysabusido/ccash/frontend && npm run build && pm2 restart ccash-frontend
```

- [ ] **Step 3: Check backend logs for errors**

```bash
pm2 logs ccash-backend --lines 20
```

- [ ] **Step 4: Verify GraphQL schema includes new types**

```bash
curl -s http://localhost:8831/graphql -H "Content-Type: application/json" -d '{"query":"{ __type(name:\"AdminMemberType\") { name fields { name type { name } } } }"}' | python3 -m json.tool
```

- [ ] **Step 5: Run tests**

```bash
cd /home/joeysabusido/ccash/backend && ./.venv/bin/python -m pytest
```
