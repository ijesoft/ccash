import { useState } from "react";
import { Box, Typography, Stack, Button, Chip, IconButton, Menu, MenuItem, ListItemIcon, ListItemText, Snackbar, Alert, TextField } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useQuery, useMutation } from "@apollo/client";
import { useNavigate } from "react-router-dom";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import BlockIcon from "@mui/icons-material/Block";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import PersonIcon from "@mui/icons-material/Person";
import SupervisorAccountIcon from "@mui/icons-material/SupervisorAccount";
import BadgeIcon from "@mui/icons-material/Badge";
import LockResetIcon from "@mui/icons-material/LockReset";
import SearchIcon from "@mui/icons-material/Search";
import { GET_ADMIN_MEMBERS, GET_ADMIN_STATS, GET_ADMIN_USER_COUNT, ACTIVATE_USER, SUSPEND_USER, UPDATE_USER_ROLE, ADMIN_SET_MEMBER_ID } from "../graphql/queries/admin";
import { formatMoney } from "../utils/format";
import SetIdDialog from "../components/SetIdDialog";
import ResetPasswordDialog from "../components/ResetPasswordDialog";

type AccountRow = { id: string; email: string; status: string; role: string; idNo: string | null };

export default function SuperAdminUsers() {
  const navigate = useNavigate();
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 10 });
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedUser, setSelectedUser] = useState<AccountRow | null>(null);
  const [setIdTarget, setSetIdTarget] = useState<AccountRow | null>(null);
  const [resetPasswordTarget, setResetPasswordTarget] = useState<AccountRow | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({ open: false, message: "", severity: "success" });
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const { data: membersData, loading: membersLoading, refetch } = useQuery(GET_ADMIN_MEMBERS, {
    variables: { limit: paginationModel.pageSize, offset: paginationModel.page * paginationModel.pageSize, search: search || null },
  });
  const { data: countData } = useQuery(GET_ADMIN_USER_COUNT, {
    variables: { search: search || null },
  });
  const [activateUser] = useMutation(ACTIVATE_USER, { refetchQueries: [{ query: GET_ADMIN_MEMBERS }, { query: GET_ADMIN_STATS }] });
  const [suspendUser] = useMutation(SUSPEND_USER, { refetchQueries: [{ query: GET_ADMIN_MEMBERS }, { query: GET_ADMIN_STATS }] });
  const [updateUserRole] = useMutation(UPDATE_USER_ROLE, { refetchQueries: [{ query: GET_ADMIN_MEMBERS }, { query: GET_ADMIN_STATS }] });
  const [setMemberId] = useMutation(ADMIN_SET_MEMBER_ID, { refetchQueries: [{ query: GET_ADMIN_MEMBERS }] });
  const members = membersData?.adminUsers ?? [];
  const rowCount = countData?.adminUsersCount ?? 0;

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, row: AccountRow) => { setAnchorEl(event.currentTarget); setSelectedUser(row); };
  const handleMenuClose = () => { setAnchorEl(null); setSelectedUser(null); };
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); setSnackbar({ open: true, message: ok, severity: "success" }); refetch(); }
    catch (err: unknown) { setSnackbar({ open: true, message: err instanceof Error ? err.message : "Failed", severity: "error" }); }
    handleMenuClose();
  };

  const columns: GridColDef[] = [
    { field: "email", headerName: "Email", flex: 1, minWidth: 200,
      renderCell: (params) => (<Button variant="text" size="small" onClick={() => navigate(`/admin/accounts/${params.row.id}`)} sx={{ textTransform: "none", justifyContent: "flex-start", minWidth: 0, px: 0 }}>{params.value}</Button>) },
    { field: "phone", headerName: "Mobile", width: 140 },
    { field: "idNo", headerName: "ID No.", width: 110 },
    { field: "role", headerName: "Role", width: 130,
      renderCell: (params) => (<Chip label={params.value} color={params.value === "SUPER_ADMIN" ? "error" : params.value === "ADMIN" ? "primary" : params.value === "MERCHANT" ? "secondary" : "default"} size="small" variant="outlined" />) },
    { field: "status", headerName: "Status", width: 120,
      renderCell: (params) => (<Chip label={params.value} color={params.value === "ACTIVE" ? "success" : params.value === "SUSPENDED" ? "error" : "warning"} size="small" />) },
    { field: "walletBalanceCents", headerName: "Balance", width: 130, valueFormatter: (value) => formatMoney(value) },
    { field: "createdAt", headerName: "Joined", width: 150,
      valueFormatter: (value) => { if (!value) return ""; return new Date(value).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }); } },
    { field: "actions", headerName: "Actions", width: 80, sortable: false, filterable: false,
      renderCell: (params) => (<IconButton size="small" onClick={(e) => handleMenuOpen(e, params.row)} aria-label="Actions"><MoreVertIcon /></IconButton>) },
  ];

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5" fontWeight="bold">Users</Typography>
        <Chip icon={<SupervisorAccountIcon />} label="SUPER ADMIN" color="error" variant="outlined" size="small" />
      </Stack>
      <Typography variant="body2" color="text.secondary" mb={2}>Members, merchants, admins and super-admins listed with status; use Actions to update a record.</Typography>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} mb={2} component="form" onSubmit={(e) => { e.preventDefault(); setPaginationModel((m) => ({ ...m, page: 0 })); setSearch(searchInput.trim()); }}>
        <TextField
          label="Search email, mobile, name or ID"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          size="small"
          sx={{ flex: 1, maxWidth: 480 }}
          placeholder="alice@ccash.ph, 0918…, M352600292"
        />
        <Button type="submit" variant="contained" startIcon={<SearchIcon />} sx={{ minHeight: 40 }}>
          Search
        </Button>
      </Stack>
      <Box sx={{ height: 560, width: "100%" }}>
        <DataGrid rows={members} columns={columns} loading={membersLoading} paginationModel={paginationModel} onPaginationModelChange={setPaginationModel} paginationMode="server" rowCount={rowCount} pageSizeOptions={[5, 10, 25]} disableRowSelectionOnClick sx={{ border: 1, borderColor: "divider", borderRadius: 2 }} />
      </Box>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}>
        {selectedUser?.status !== "ACTIVE" && (<MenuItem onClick={() => selectedUser && act(() => activateUser({ variables: { userId: selectedUser.id } }), `${selectedUser.email} activated`)}><ListItemIcon><CheckCircleIcon fontSize="small" color="success" /></ListItemIcon><ListItemText>Activate</ListItemText></MenuItem>)}
        {selectedUser?.status === "ACTIVE" && (<MenuItem onClick={() => selectedUser && act(() => suspendUser({ variables: { userId: selectedUser.id } }), `${selectedUser.email} suspended`)}><ListItemIcon><BlockIcon fontSize="small" color="error" /></ListItemIcon><ListItemText>Suspend</ListItemText></MenuItem>)}
        {selectedUser?.role !== "ADMIN" && (<MenuItem onClick={() => selectedUser && act(() => updateUserRole({ variables: { userId: selectedUser.id, role: "ADMIN" } }), `${selectedUser.email} → ADMIN`)}><ListItemIcon><AdminPanelSettingsIcon fontSize="small" color="primary" /></ListItemIcon><ListItemText>Make Admin</ListItemText></MenuItem>)}
        {selectedUser?.role !== "SUPER_ADMIN" && (<MenuItem onClick={() => selectedUser && act(() => updateUserRole({ variables: { userId: selectedUser.id, role: "SUPER_ADMIN" } }), `${selectedUser.email} → SUPER_ADMIN`)}><ListItemIcon><SupervisorAccountIcon fontSize="small" color="error" /></ListItemIcon><ListItemText>Make Super Admin</ListItemText></MenuItem>)}
        {(selectedUser?.role === "ADMIN" || selectedUser?.role === "SUPER_ADMIN") && (<MenuItem onClick={() => selectedUser && act(() => updateUserRole({ variables: { userId: selectedUser.id, role: "MEMBER" } }), `${selectedUser.email} → MEMBER`)}><ListItemIcon><PersonIcon fontSize="small" /></ListItemIcon><ListItemText>Demote to Member</ListItemText></MenuItem>)}
        {selectedUser?.role !== "MERCHANT" && (<MenuItem onClick={() => { if (selectedUser) setSetIdTarget(selectedUser); handleMenuClose(); }}><ListItemIcon><BadgeIcon fontSize="small" /></ListItemIcon><ListItemText>{selectedUser?.idNo ? "Change ID No." : "Set ID No."}</ListItemText></MenuItem>)}
        <MenuItem onClick={() => { if (selectedUser) setResetPasswordTarget(selectedUser); handleMenuClose(); }}><ListItemIcon><LockResetIcon fontSize="small" color="warning" /></ListItemIcon><ListItemText>Reset Password</ListItemText></MenuItem>
      </Menu>
      <SetIdDialog open={Boolean(setIdTarget)} onClose={() => setSetIdTarget(null)} title="Set Member ID No." label="ID No." helperText="9-digit Member/Admin/Super-admin login ID" initialValue={setIdTarget?.idNo} maxLength={9} transform={(raw) => raw.replace(/\D/g, "")} isValid={(v) => /^\d{9}$/.test(v)} invalidMessage="ID No. must be exactly 9 digits" onSubmit={async (value) => { if (!setIdTarget) return; await setMemberId({ variables: { userId: setIdTarget.id, idNo: value } }); setSnackbar({ open: true, message: `ID No. set for ${setIdTarget.email}`, severity: "success" }); }} />
      {resetPasswordTarget && (<ResetPasswordDialog open={Boolean(resetPasswordTarget)} onClose={() => setResetPasswordTarget(null)} userId={resetPasswordTarget.id} email={resetPasswordTarget.email} />)}
      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })} anchorOrigin={{ vertical: "bottom", horizontal: "right" }}><Alert onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity} variant="filled">{snackbar.message}</Alert></Snackbar>
    </Box>
  );
}
