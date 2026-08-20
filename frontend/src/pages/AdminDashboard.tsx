import { useState } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Snackbar,
  Alert,
} from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useQuery, useMutation } from "@apollo/client";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import BlockIcon from "@mui/icons-material/Block";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import PersonIcon from "@mui/icons-material/Person";
import {
  GET_ADMIN_STATS,
  GET_ADMIN_MEMBERS,
  ACTIVATE_USER,
  SUSPEND_USER,
  UPDATE_USER_ROLE,
} from "../graphql/queries/admin";
import { formatMoney } from "../utils/format";

export default function AdminDashboard() {
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 10 });
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedUser, setSelectedUser] = useState<{ id: string; email: string; status: string; role: string } | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({
    open: false,
    message: "",
    severity: "success",
  });

  const { data: statsData, loading: statsLoading } = useQuery(GET_ADMIN_STATS);
  const { data: membersData, loading: membersLoading, refetch } = useQuery(GET_ADMIN_MEMBERS, {
    variables: {
      limit: paginationModel.pageSize,
      offset: paginationModel.page * paginationModel.pageSize,
    },
  });

  const [activateUser] = useMutation(ACTIVATE_USER, {
    refetchQueries: [{ query: GET_ADMIN_MEMBERS }, { query: GET_ADMIN_STATS }],
  });

  const [suspendUser] = useMutation(SUSPEND_USER, {
    refetchQueries: [{ query: GET_ADMIN_MEMBERS }, { query: GET_ADMIN_STATS }],
  });

  const [updateUserRole] = useMutation(UPDATE_USER_ROLE, {
    refetchQueries: [{ query: GET_ADMIN_MEMBERS }, { query: GET_ADMIN_STATS }],
  });

  const stats = statsData?.platformStats;
  const members = membersData?.adminUsers ?? [];

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, row: { id: string; email: string; status: string; role: string }) => {
    setAnchorEl(event.currentTarget);
    setSelectedUser(row);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedUser(null);
  };

  const handleActivate = async () => {
    if (!selectedUser) return;
    try {
      await activateUser({ variables: { userId: selectedUser.id } });
      setSnackbar({ open: true, message: `${selectedUser.email} activated successfully`, severity: "success" });
      refetch();
    } catch (err: any) {
      setSnackbar({ open: true, message: err.message || "Failed to activate user", severity: "error" });
    }
    handleMenuClose();
  };

  const handleSuspend = async () => {
    if (!selectedUser) return;
    try {
      await suspendUser({ variables: { userId: selectedUser.id } });
      setSnackbar({ open: true, message: `${selectedUser.email} suspended`, severity: "success" });
      refetch();
    } catch (err: any) {
      setSnackbar({ open: true, message: err.message || "Failed to suspend user", severity: "error" });
    }
    handleMenuClose();
  };

  const handleRoleChange = async (newRole: "USER" | "ADMIN") => {
    if (!selectedUser) return;
    try {
      await updateUserRole({ variables: { userId: selectedUser.id, role: newRole } });
      setSnackbar({ open: true, message: `${selectedUser.email} role changed to ${newRole}`, severity: "success" });
      refetch();
    } catch (err: any) {
      setSnackbar({ open: true, message: err.message || "Failed to update role", severity: "error" });
    }
    handleMenuClose();
  };

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
    {
      field: "actions",
      headerName: "Actions",
      width: 80,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <IconButton
          size="small"
          onClick={(e) => handleMenuOpen(e, params.row)}
          aria-label="Actions"
        >
          <MoreVertIcon />
        </IconButton>
      ),
    },
  ];

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

      {/* Actions Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        {selectedUser?.status !== "ACTIVE" && (
          <MenuItem onClick={handleActivate}>
            <ListItemIcon>
              <CheckCircleIcon fontSize="small" color="success" />
            </ListItemIcon>
            <ListItemText>Activate</ListItemText>
          </MenuItem>
        )}
        {selectedUser?.status === "ACTIVE" && (
          <MenuItem onClick={handleSuspend}>
            <ListItemIcon>
              <BlockIcon fontSize="small" color="error" />
            </ListItemIcon>
            <ListItemText>Suspend</ListItemText>
          </MenuItem>
        )}
        {selectedUser?.role !== "ADMIN" && (
          <MenuItem onClick={() => handleRoleChange("ADMIN")}>
            <ListItemIcon>
              <AdminPanelSettingsIcon fontSize="small" color="primary" />
            </ListItemIcon>
            <ListItemText>Make Admin</ListItemText>
          </MenuItem>
        )}
        {selectedUser?.role === "ADMIN" && (
          <MenuItem onClick={() => handleRoleChange("USER")}>
            <ListItemIcon>
              <PersonIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Remove Admin</ListItemText>
          </MenuItem>
        )}
      </Menu>

      {/* Snackbar for feedback */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
