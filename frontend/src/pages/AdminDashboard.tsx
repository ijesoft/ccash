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
  Tabs,
  Tab,
  Button,
  Stack,
  CircularProgress,
} from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useQuery, useMutation } from "@apollo/client";
import { useNavigate } from "react-router-dom";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import BlockIcon from "@mui/icons-material/Block";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import PersonIcon from "@mui/icons-material/Person";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import TableChartIcon from "@mui/icons-material/TableChart";
import BadgeIcon from "@mui/icons-material/Badge";
import LockResetIcon from "@mui/icons-material/LockReset";
import {
  GET_ADMIN_STATS,
  GET_ADMIN_MEMBERS,
  ACTIVATE_USER,
  SUSPEND_USER,
  UPDATE_USER_ROLE,
  ADMIN_SET_MEMBER_ID,
} from "../graphql/queries/admin";
import { formatMoney } from "../utils/format";
import { downloadReport } from "../utils/reportDownload";
import BrandingSection from "../components/BrandingSection";
import AccountExportMenu from "../components/AccountExportMenu";
import MerchantsTable from "../components/MerchantsTable";
import AddMemberDialog from "../components/AddMemberDialog";
import BatchUploadDialog from "../components/BatchUploadDialog";
import SetIdDialog from "../components/SetIdDialog";
import ResetPasswordDialog from "../components/ResetPasswordDialog";

type AccountRow = { id: string; email: string; status: string; role: string; idNo: string | null };

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"accounts" | "merchants">("accounts");
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 10 });
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedUser, setSelectedUser] = useState<AccountRow | null>(null);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [batchUploadOpen, setBatchUploadOpen] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "xlsx" | null>(null);
  const [setIdTarget, setSetIdTarget] = useState<AccountRow | null>(null);
  const [resetPasswordTarget, setResetPasswordTarget] = useState<AccountRow | null>(null);
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

  const [setMemberId] = useMutation(ADMIN_SET_MEMBER_ID, {
    refetchQueries: [{ query: GET_ADMIN_MEMBERS }],
  });

  const stats = statsData?.platformStats;
  const members = membersData?.adminUsers ?? [];

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, row: AccountRow) => {
    setAnchorEl(event.currentTarget);
    setSelectedUser(row);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedUser(null);
  };

  const handleOpenSetId = () => {
    if (selectedUser) setSetIdTarget(selectedUser);
    handleMenuClose();
  };

  const handleOpenResetPassword = () => {
    if (selectedUser) setResetPasswordTarget(selectedUser);
    handleMenuClose();
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

  const handleRoleChange = async (newRole: "MEMBER" | "ADMIN") => {
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

  const handleExportAll = async (kind: "pdf" | "xlsx") => {
    setExporting(kind);
    try {
      await downloadReport(`/api/admin/reports/transactions/all.${kind}`, `ccash-all-transactions.${kind}`);
    } catch (err: any) {
      setSnackbar({ open: true, message: err.message || "Export failed", severity: "error" });
    } finally {
      setExporting(null);
    }
  };

  const columns: GridColDef[] = [
    {
      field: "email",
      headerName: "Email",
      flex: 1,
      minWidth: 200,
      renderCell: (params) => (
        <Button
          variant="text"
          size="small"
          onClick={() => navigate(`/admin/accounts/${params.row.id}`)}
          sx={{ textTransform: "none", justifyContent: "flex-start", minWidth: 0, px: 0 }}
        >
          {params.value}
        </Button>
      ),
    },
    { field: "idNo", headerName: "ID No.", width: 110 },
    {
      field: "role",
      headerName: "Role",
      width: 110,
      renderCell: (params) => (
        <Chip
          label={params.value}
          color={params.value === "ADMIN" ? "primary" : params.value === "MERCHANT" ? "secondary" : "default"}
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
      field: "export",
      headerName: "Export",
      width: 80,
      sortable: false,
      filterable: false,
      renderCell: (params) => <AccountExportMenu accountId={params.row.id} accountLabel={params.row.email} />,
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
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" rowGap={1} mb={3}>
        <Typography variant="h5" fontWeight="bold">Admin Dashboard</Typography>
        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            variant="outlined"
            startIcon={exporting === "pdf" ? <CircularProgress size={16} /> : <PictureAsPdfIcon />}
            disabled={exporting !== null}
            onClick={() => handleExportAll("pdf")}
          >
            Export All (PDF)
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={exporting === "xlsx" ? <CircularProgress size={16} /> : <TableChartIcon />}
            disabled={exporting !== null}
            onClick={() => handleExportAll("xlsx")}
          >
            Export All (Excel)
          </Button>
        </Stack>
      </Stack>

      <BrandingSection />

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

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab value="accounts" label="Members & Accounts" />
        <Tab value="merchants" label="Merchants" />
      </Tabs>

      {tab === "accounts" && (
        <>
          <Stack direction="row" spacing={1} justifyContent="flex-end" mb={2}>
            <Button size="small" variant="outlined" startIcon={<PersonAddIcon />} onClick={() => setAddMemberOpen(true)}>
              Add Member
            </Button>
            <Button size="small" variant="outlined" startIcon={<UploadFileIcon />} onClick={() => setBatchUploadOpen(true)}>
              Batch Upload
            </Button>
          </Stack>

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
        </>
      )}

      {tab === "merchants" && <MerchantsTable />}

      <AddMemberDialog
        open={addMemberOpen}
        onClose={() => setAddMemberOpen(false)}
        onCreated={() => {
          refetch();
        }}
      />
      <BatchUploadDialog
        open={batchUploadOpen}
        onClose={() => setBatchUploadOpen(false)}
        onUploaded={() => refetch()}
      />

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
          <MenuItem onClick={() => handleRoleChange("MEMBER")}>
            <ListItemIcon>
              <PersonIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Remove Admin</ListItemText>
          </MenuItem>
        )}
        {selectedUser?.role !== "MERCHANT" && (
          <MenuItem onClick={handleOpenSetId}>
            <ListItemIcon>
              <BadgeIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{selectedUser?.idNo ? "Change ID No." : "Set ID No."}</ListItemText>
          </MenuItem>
        )}
        <MenuItem onClick={handleOpenResetPassword}>
          <ListItemIcon>
            <LockResetIcon fontSize="small" color="warning" />
          </ListItemIcon>
          <ListItemText>Reset Password</ListItemText>
        </MenuItem>
      </Menu>

      <SetIdDialog
        open={Boolean(setIdTarget)}
        onClose={() => setSetIdTarget(null)}
        title="Set Member ID No."
        label="ID No."
        helperText="9-digit Member/Admin login ID"
        initialValue={setIdTarget?.idNo}
        maxLength={9}
        transform={(raw) => raw.replace(/\D/g, "")}
        isValid={(v) => /^\d{9}$/.test(v)}
        invalidMessage="ID No. must be exactly 9 digits"
        onSubmit={async (value) => {
          if (!setIdTarget) return;
          await setMemberId({ variables: { userId: setIdTarget.id, idNo: value } });
          setSnackbar({ open: true, message: `ID No. set for ${setIdTarget.email}`, severity: "success" });
        }}
      />

      {resetPasswordTarget && (
        <ResetPasswordDialog
          open={Boolean(resetPasswordTarget)}
          onClose={() => setResetPasswordTarget(null)}
          userId={resetPasswordTarget.id}
          email={resetPasswordTarget.email}
        />
      )}

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
