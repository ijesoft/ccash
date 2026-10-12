import { useState } from "react";
import { Box, Button, Chip, IconButton, Menu, MenuItem, ListItemIcon, ListItemText, Snackbar, Alert } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useQuery, useMutation } from "@apollo/client";
import { useNavigate } from "react-router-dom";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import BadgeIcon from "@mui/icons-material/Badge";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import { GET_ADMIN_MERCHANTS, ADMIN_SET_MERCHANT_ID, SET_WALLET_DAILY_LIMIT } from "../graphql/queries/admin";
import { formatMoney } from "../utils/format";
import AccountExportMenu from "./AccountExportMenu";
import SetIdDialog from "./SetIdDialog";

type MerchantRow = { id: string; email: string; merchantIdNo: string; dailySendLimitCents?: number | null };

export default function MerchantsTable() {
  const navigate = useNavigate();
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 10 });
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selected, setSelected] = useState<MerchantRow | null>(null);
  const [setIdTarget, setSetIdTarget] = useState<MerchantRow | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({
    open: false,
    message: "",
    severity: "success",
  });

  const { data, loading, refetch } = useQuery(GET_ADMIN_MERCHANTS, {
    variables: {
      limit: paginationModel.pageSize,
      offset: paginationModel.page * paginationModel.pageSize,
    },
  });
  const [setMerchantId] = useMutation(ADMIN_SET_MERCHANT_ID);
  const [setWalletDailyLimit] = useMutation(SET_WALLET_DAILY_LIMIT);
  const [limitTarget, setLimitTarget] = useState<MerchantRow | null>(null);

  const merchants = data?.adminMerchants ?? [];

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, row: MerchantRow) => {
    setAnchorEl(event.currentTarget);
    setSelected(row);
  };
  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelected(null);
  };

  const columns: GridColDef[] = [
    { field: "merchantIdNo", headerName: "Merchant ID", width: 130 },
    {
      field: "companyName",
      headerName: "Company / Name",
      flex: 1,
      minWidth: 180,
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
    { field: "contactPerson", headerName: "Contact Person", width: 160 },
    { field: "mobileNo", headerName: "Mobile No.", width: 130 },
    { field: "email", headerName: "Email", width: 200 },
    {
      field: "dailySendLimitCents",
      headerName: "Daily Limit",
      width: 130,
      renderCell: (params) => <span>{formatMoney(params.value ?? 0)}</span>,
    },
    {
      field: "status",
      headerName: "Status",
      width: 110,
      renderCell: (params) => (
        <Chip
          label={params.value}
          color={params.value === "ACTIVE" ? "success" : params.value === "SUSPENDED" ? "error" : "warning"}
          size="small"
        />
      ),
    },
    {
      field: "export",
      headerName: "Export",
      width: 90,
      sortable: false,
      filterable: false,
      renderCell: (params) => <AccountExportMenu accountId={params.row.id} accountLabel={params.row.merchantIdNo} />,
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
    <Box sx={{ height: 500, width: "100%" }}>
      <DataGrid
        rows={merchants}
        columns={columns}
        loading={loading}
        paginationModel={paginationModel}
        onPaginationModelChange={setPaginationModel}
        pageSizeOptions={[5, 10, 25]}
        disableRowSelectionOnClick
        sx={{ border: 1, borderColor: "divider", borderRadius: 2 }}
      />

      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}>
        <MenuItem
          onClick={() => {
            if (selected) setSetIdTarget(selected);
            handleMenuClose();
          }}
        >
          <ListItemIcon><BadgeIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Change Merchant ID</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (selected) setLimitTarget(selected);
            handleMenuClose();
          }}
        >
          <ListItemIcon><AttachMoneyIcon fontSize="small" color="success" /></ListItemIcon>
          <ListItemText>Set daily limit</ListItemText>
        </MenuItem>
      </Menu>

      <SetIdDialog
        open={Boolean(setIdTarget)}
        onClose={() => setSetIdTarget(null)}
        title="Set Merchant ID"
        label="Merchant ID"
        helperText="'M' followed by 9 digits"
        initialValue={setIdTarget?.merchantIdNo}
        maxLength={10}
        transform={(raw) => {
          const digits = raw.toUpperCase().replace(/[^0-9]/g, "");
          return digits ? `M${digits}` : "";
        }}
        isValid={(v) => /^M\d{9}$/.test(v)}
        invalidMessage="Merchant ID must be 'M' followed by 9 digits"
        onSubmit={async (value) => {
          if (!setIdTarget) return;
          await setMerchantId({ variables: { userId: setIdTarget.id, merchantIdNo: value } });
          setSnackbar({ open: true, message: `Merchant ID set for ${setIdTarget.email}`, severity: "success" });
          refetch();
        }}
      />

      <SetIdDialog
        open={Boolean(limitTarget)}
        onClose={() => setLimitTarget(null)}
        title={`Set daily send limit — ${limitTarget?.email ?? ""}`}
        label="Daily limit (PHP)"
        helperText="Between ₱1.00 and ₱1,000,000.00"
        initialValue={limitTarget ? String((limitTarget.dailySendLimitCents ?? 5000000) / 100) : ""}
        maxLength={10}
        transform={(raw) => {
          const cleaned = raw.replace(/[^0-9.]/g, "");
          const parts = cleaned.split(".");
          return parts.length <= 2 ? cleaned : `${parts[0]}.${parts.slice(1).join("")}`;
        }}
        isValid={(v) => {
          const cents = Math.round(Number(v) * 100);
          return Number.isFinite(cents) && cents >= 100 && cents <= 100000000;
        }}
        invalidMessage="Enter a limit between ₱1.00 and ₱1,000,000.00"
        onSubmit={async (value) => {
          if (!limitTarget) return;
          await setWalletDailyLimit({ variables: { userId: limitTarget.id, dailySendLimitCents: Math.round(Number(value) * 100) } });
          setSnackbar({ open: true, message: `Daily limit updated for ${limitTarget.email}`, severity: "success" });
          refetch();
        }}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert onClose={() => setSnackbar((s) => ({ ...s, open: false }))} severity={snackbar.severity} variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
