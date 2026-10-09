import { useState } from "react";
import { Box, Typography, Chip, Stack, TextField, MenuItem, Button, Dialog, DialogTitle, DialogContent } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useQuery } from "@apollo/client";
import VerifiedUserIcon from "@mui/icons-material/VerifiedUser";
import SearchIcon from "@mui/icons-material/Search";
import { GET_ALL_TRANSACTIONS, GET_ADMIN_USER_TRANSACTIONS } from "../graphql/queries/admin";
import { formatMoney } from "../utils/format";

export default function AuditorTransactions() {
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 10 });
  const [txType, setTxType] = useState("");
  const [status, setStatus] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [inspectedUserId, setInspectedUserId] = useState("");
  const [inspectedIdInput, setInspectedIdInput] = useState("");
  const { data: userTxData } = useQuery(GET_ADMIN_USER_TRANSACTIONS, {
    variables: { userId: inspectedUserId, limit: 10, offset: 0 },
    skip: !inspectedUserId,
  });

  const variables = {
    limit: paginationModel.pageSize,
    offset: paginationModel.page * paginationModel.pageSize,
    txType: txType || null,
    status: status || null,
    search: search || null,
  };
  const { data, loading } = useQuery(GET_ALL_TRANSACTIONS, { variables });
  const rows = (data?.adminAllTransactions?.items ?? []).map((r: any) => ({ ...r, id: r.id }));
  const rowCount = data?.adminAllTransactions?.total ?? 0;

  const columns: GridColDef[] = [
    { field: "createdAt", headerName: "Time", width: 150 },
    { field: "reference", headerName: "Reference", width: 150 },
    { field: "type", headerName: "Type", width: 130 },
    { field: "status", headerName: "Status", width: 120 },
    { field: "sender", headerName: "From", flex: 1, minWidth: 160 },
    { field: "receiver", headerName: "To", flex: 1, minWidth: 160 },
    { field: "amountCents", headerName: "Amount", width: 130, valueFormatter: (v: any) => formatMoney(Number(v ?? 0)) },
  ];

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5" fontWeight="bold">Transactions</Typography>
        <Chip icon={<VerifiedUserIcon />} label="AUDITOR · READ ONLY" color="info" variant="outlined" size="small" />
      </Stack>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} mb={2} component="form" onSubmit={(e) => { e.preventDefault(); setPaginationModel((m) => ({ ...m, page: 0 })); setSearch(searchInput.trim()); }}>
        <TextField select label="Type" value={txType} onChange={(e) => setTxType(e.target.value)} size="small" sx={{ minWidth: 160 }}>
          <MenuItem value="">All types</MenuItem>
          {["CASH_IN", "CASH_OUT", "SEND", "RECEIVE", "QR_PAYMENT"].map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
        </TextField>
        <TextField select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} size="small" sx={{ minWidth: 160 }}>
          <MenuItem value="">All statuses</MenuItem>
          {["SUCCESS", "PENDING", "FAILED", "REVERSED"].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
        </TextField>
        <TextField label="Search reference or description" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} size="small" sx={{ flex: 1 }} />
        <Button type="submit" variant="contained" startIcon={<SearchIcon />} sx={{ minHeight: 40 }}>Search</Button>
      </Stack>
      <Box sx={{ height: 560, width: "100%" }}>
        <DataGrid rows={rows} columns={columns} loading={loading} paginationModel={paginationModel} onPaginationModelChange={setPaginationModel} paginationMode="server" rowCount={rowCount} pageSizeOptions={[5, 10, 25]} disableRowSelectionOnClick sx={{ border: 1, borderColor: "divider", borderRadius: 2 }} />
      </Box>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} mb={2}>
        <TextField label="Inspect user ID" value={inspectedIdInput} onChange={(e) => setInspectedIdInput(e.target.value)} size="small" sx={{ flex: 1 }} placeholder="paste a user id from Admin" />
        <Button variant="outlined" onClick={() => setInspectedUserId(inspectedIdInput.trim())} disabled={!inspectedIdInput.trim()}>Inspect</Button>
      </Stack>
      <Dialog open={!!inspectedUserId} onClose={() => setInspectedUserId("")} maxWidth="md" fullWidth>
        <DialogTitle>User history</DialogTitle>
        <DialogContent>
          {(userTxData?.adminUserTransactions ?? []).map((t: any) => (
            <Box key={t.id} sx={{ py: 1, borderBottom: "1px solid", borderColor: "divider" }}>
              <Typography variant="body2" fontWeight={700}>{t.type} · {t.direction} · {formatMoney(t.amount?.cents ?? 0)}</Typography>
              <Typography variant="caption" color="text.secondary">{t.counterparty?.name} · {t.reference} · {t.createdAt}</Typography>
            </Box>
          ))}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
