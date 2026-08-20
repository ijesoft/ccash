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
    valueFormatter: (value) => formatMoney(value),
  },
  {
    field: "createdAt",
    headerName: "Joined",
    width: 160,
    valueFormatter: (value) => {
      if (!value) return "";
      return new Date(value).toLocaleDateString("en-PH", {
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
