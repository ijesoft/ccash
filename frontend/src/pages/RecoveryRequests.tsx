import { useState } from "react";
import {
  Box,
  Typography,
  Stack,
  Chip,
  TextField,
  MenuItem,
  Button,
  IconButton,
  Menu,
  ListItemIcon,
  ListItemText,
  Snackbar,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useQuery, useMutation } from "@apollo/client";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import SearchIcon from "@mui/icons-material/Search";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import {
  GET_RECOVERY_REQUESTS,
  GET_RECOVERY_REQUEST_COUNT,
  APPROVE_RECOVERY_REQUEST,
  CANCEL_RECOVERY_REQUEST,
} from "../graphql/queries/admin";
import ConfirmDialog from "../components/ConfirmDialog";

const STATUS_OPTIONS = ["pending", "approved", "cancelled", "processed"];

function statusColor(status: string): "warning" | "info" | "success" | "default" {
  if (status === "pending") return "warning";
  if (status === "approved") return "info";
  if (status === "processed") return "success";
  return "default";
}

function formatDateTime(value: string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type RecoveryRow = {
  id: string;
  email: string | null;
  status: string;
  requestedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  expiresAt: string | null;
};

export default function RecoveryRequests() {
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 10 });
  const [status, setStatus] = useState<string>("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selected, setSelected] = useState<RecoveryRow | null>(null);
  const [confirmAction, setConfirmAction] = useState<"approve" | "cancel" | null>(null);
  const [revealed, setRevealed] = useState<{ email: string; code: string } | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({
    open: false,
    message: "",
    severity: "success",
  });

  const variables = {
    limit: paginationModel.pageSize,
    offset: paginationModel.page * paginationModel.pageSize,
    status: status || null,
    search: search || null,
  };
  const { data, loading, refetch } = useQuery(GET_RECOVERY_REQUESTS, { variables });
  const { data: countData, refetch: refetchCount } = useQuery(GET_RECOVERY_REQUEST_COUNT, {
    variables: { status: status || null, search: search || null },
  });
  const [approveRequest] = useMutation(APPROVE_RECOVERY_REQUEST);
  const [cancelRequest] = useMutation(CANCEL_RECOVERY_REQUEST);

  const rows: RecoveryRow[] = data?.passwordRecoveryRequests ?? [];
  const rowCount = countData?.passwordRecoveryRequestsCount ?? 0;

  const refresh = () => {
    refetch();
    refetchCount();
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, row: RecoveryRow) => {
    setAnchorEl(event.currentTarget);
    setSelected(row);
  };
  const handleMenuClose = () => {
    setAnchorEl(null);
  };
  const handleConfirmClose = () => {
    setConfirmAction(null);
    setSelected(null);
  };

  const handleConfirm = async () => {
    if (!selected || !confirmAction) return;
    if (confirmAction === "approve") {
      const { data: result } = await approveRequest({ variables: { requestId: selected.id } });
      const code = result.approvePasswordRecoveryRequest.recoveryCode as string;
      setRevealed({ email: selected.email ?? "", code });
      setSnackbar({ open: true, message: `Recovery code issued for ${selected.email}`, severity: "success" });
    } else {
      await cancelRequest({ variables: { requestId: selected.id } });
      setSnackbar({ open: true, message: `Recovery request for ${selected.email} cancelled`, severity: "success" });
    }
    refresh();
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPaginationModel((m) => ({ ...m, page: 0 }));
    setSearch(searchInput.trim());
  };

  const columns: GridColDef[] = [
    { field: "email", headerName: "Email", flex: 1, minWidth: 200 },
    {
      field: "status",
      headerName: "Status",
      width: 130,
      renderCell: (params) => <Chip label={params.value} color={statusColor(params.value)} size="small" />,
    },
    {
      field: "requestedAt",
      headerName: "Requested",
      width: 170,
      valueFormatter: (value) => formatDateTime(value as string | null),
    },
    {
      field: "decidedAt",
      headerName: "Decided",
      width: 170,
      valueFormatter: (value) => formatDateTime(value as string | null),
    },
    { field: "decidedBy", headerName: "Decided By", flex: 1, minWidth: 180 },
    {
      field: "expiresAt",
      headerName: "Expires",
      width: 170,
      valueFormatter: (value) => formatDateTime(value as string | null),
    },
    {
      field: "actions",
      headerName: "Actions",
      width: 80,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <IconButton size="small" onClick={(e) => handleMenuOpen(e, params.row)} aria-label="Actions">
          <MoreVertIcon />
        </IconButton>
      ),
    },
  ];

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5" fontWeight="bold">Password Recovery</Typography>
        <Chip icon={<AdminPanelSettingsIcon />} label="ADMIN" color="primary" variant="outlined" size="small" />
      </Stack>
      <Typography variant="body2" color="text.secondary" mb={2}>
        Approve recovery requests to issue a single-use code, shown once — relay it to the account holder. Codes expire 1 hour after approval.
      </Typography>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} mb={2} component="form" onSubmit={submitSearch}>
        <TextField
          select
          label="Status"
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPaginationModel((m) => ({ ...m, page: 0 })); }}
          size="small"
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="">All statuses</MenuItem>
          {STATUS_OPTIONS.map((s) => (
            <MenuItem key={s} value={s}>{s}</MenuItem>
          ))}
        </TextField>
        <TextField
          label="Search email"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          size="small"
          sx={{ flex: 1 }}
          placeholder="alice@ccash.ph"
        />
        <Button type="submit" variant="contained" startIcon={<SearchIcon />} sx={{ minHeight: 40 }}>
          Search
        </Button>
      </Stack>
      <Box sx={{ height: 560, width: "100%" }}>
        <DataGrid
          rows={rows}
          columns={columns}
          loading={loading}
          paginationModel={paginationModel}
          onPaginationModelChange={setPaginationModel}
          paginationMode="server"
          rowCount={rowCount}
          pageSizeOptions={[5, 10, 25]}
          disableRowSelectionOnClick
          sx={{ border: 1, borderColor: "divider", borderRadius: 2 }}
        />
      </Box>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}>
        {selected?.status === "pending" && (
          <MenuItem onClick={() => { setConfirmAction("approve"); handleMenuClose(); }}>
            <ListItemIcon><CheckCircleIcon fontSize="small" color="success" /></ListItemIcon>
            <ListItemText>Approve</ListItemText>
          </MenuItem>
        )}
        {(selected?.status === "pending" || selected?.status === "approved") && (
          <MenuItem onClick={() => { setConfirmAction("cancel"); handleMenuClose(); }}>
            <ListItemIcon><CancelIcon fontSize="small" color="error" /></ListItemIcon>
            <ListItemText>Cancel</ListItemText>
          </MenuItem>
        )}
      </Menu>
      <ConfirmDialog
        open={Boolean(confirmAction && selected)}
        onClose={handleConfirmClose}
        title={confirmAction === "approve" ? "Approve Recovery Request" : "Cancel Recovery Request"}
        message={
          confirmAction === "approve"
            ? `This issues a single-use recovery code for ${selected?.email}, valid for 1 hour. The code is shown once — relay it to the account holder. Continue?`
            : `This cancels the recovery request for ${selected?.email}. Any issued code stops working. Continue?`
        }
        confirmLabel={confirmAction === "approve" ? "Approve" : "Cancel Request"}
        confirmColor={confirmAction === "approve" ? "primary" : "error"}
        onConfirm={handleConfirm}
      />
      <Dialog open={Boolean(revealed)} onClose={() => setRevealed(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Recovery Code</DialogTitle>
        <DialogContent>
          <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>
            Code issued for {revealed?.email}.
          </Alert>
          <Typography variant="body2" color="text.secondary">Recovery code</Typography>
          <Typography fontWeight={600} fontFamily="monospace" mb={1.5}>{revealed?.code}</Typography>
          <Typography variant="caption" color="text.secondary">
            Shown here only once — relay it to the account holder now. It expires 1 hour after approval.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRevealed(null)} variant="contained">Done</Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity} variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
