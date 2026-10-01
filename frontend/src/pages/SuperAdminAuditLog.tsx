import { useState } from "react";
import { Box, Typography, Stack, Chip, TextField, MenuItem, Button } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useQuery } from "@apollo/client";
import SupervisorAccountIcon from "@mui/icons-material/SupervisorAccount";
import SearchIcon from "@mui/icons-material/Search";
import { GET_AUDIT_LOGS, GET_AUDIT_LOG_COUNT } from "../graphql/queries/admin";

const ACTION_OPTIONS = [
  "transaction.send",
  "transaction.qr_payment",
  "transaction.cash_in",
  "transaction.cash_out",
  "role.change",
];

function actionColor(action: string): "success" | "info" | "warning" | "error" | "default" {
  if (action === "transaction.send" || action === "transaction.qr_payment") return "success";
  if (action === "transaction.cash_in") return "info";
  if (action === "transaction.cash_out") return "warning";
  if (action === "role.change") return "error";
  return "default";
}

export default function SuperAdminAuditLog() {
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 10 });
  const [action, setAction] = useState<string>("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const variables = {
    limit: paginationModel.pageSize,
    offset: paginationModel.page * paginationModel.pageSize,
    action: action || null,
    search: search || null,
  };
  const { data, loading } = useQuery(GET_AUDIT_LOGS, { variables });
  const { data: countData } = useQuery(GET_AUDIT_LOG_COUNT, {
    variables: { action: action || null, search: search || null },
  });
  const rows = data?.auditLogs ?? [];
  const rowCount = countData?.auditLogsCount ?? 0;

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPaginationModel((m) => ({ ...m, page: 0 }));
    setSearch(searchInput.trim());
  };

  const columns: GridColDef[] = [
    { field: "createdAt", headerName: "Time", width: 170,
      valueFormatter: (value) => {
        if (!value) return "";
        return new Date(value).toLocaleString("en-PH", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
      } },
    { field: "actorEmail", headerName: "Actor", flex: 1, minWidth: 200 },
    { field: "action", headerName: "Action", width: 190,
      renderCell: (params) => (<Chip label={params.value} color={actionColor(params.value)} size="small" variant="outlined" />) },
    { field: "resourceType", headerName: "Resource", width: 120 },
    { field: "summary", headerName: "Details", flex: 1.4, minWidth: 260 },
  ];

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5" fontWeight="bold">Audit Log</Typography>
        <Chip icon={<SupervisorAccountIcon />} label="SUPER ADMIN" color="error" variant="outlined" size="small" />
      </Stack>
      <Typography variant="body2" color="text.secondary" mb={2}>
        Every money movement and admin action, newest first. Only super-admins can see this page.
      </Typography>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} mb={2} component="form" onSubmit={submitSearch}>
        <TextField
          select
          label="Action"
          value={action}
          onChange={(e) => { setAction(e.target.value); setPaginationModel((m) => ({ ...m, page: 0 })); }}
          size="small"
          sx={{ minWidth: 220 }}
        >
          <MenuItem value="">All actions</MenuItem>
          {ACTION_OPTIONS.map((a) => (
            <MenuItem key={a} value={a}>{a}</MenuItem>
          ))}
        </TextField>
        <TextField
          label="Search actor, action or reference"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          size="small"
          sx={{ flex: 1 }}
          placeholder="email, reference or resource id"
        />
        <Button type="submit" variant="contained" startIcon={<SearchIcon />} sx={{ minHeight: 40 }}>
          Search
        </Button>
      </Stack>
      <Box sx={{ height: 560, width: "100%" }}>
        <DataGrid rows={rows} columns={columns} loading={loading} paginationModel={paginationModel} onPaginationModelChange={setPaginationModel} paginationMode="server" rowCount={rowCount} pageSizeOptions={[5, 10, 25]} disableRowSelectionOnClick sx={{ border: 1, borderColor: "divider", borderRadius: 2 }} />
      </Box>
    </Box>
  );
}
