import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  List,
  ListItem,
  ListItemText,
  Typography,
} from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useQuery } from "@apollo/client";
import {
  GET_ADMIN_MEMBERS,
  GET_ADMIN_STATS,
  GET_ADMIN_USER_TRANSACTIONS,
} from "../graphql/queries/admin";
import { formatMoney } from "../utils/format";

interface MemberRow {
  id: string;
  email: string;
  role: string;
  status: string;
  walletBalanceCents: number;
  createdAt: string;
}

interface MemberTx {
  id: string;
  type: string;
  status: string;
  direction: "IN" | "OUT";
  counterparty: { name: string | null; maskedMobile: string } | null;
  amount: { cents: number };
  reference: string | null;
  description: string | null;
  createdAt: string;
}

function formatTxDate(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function WalletBalances() {
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 10 });
  const [selected, setSelected] = useState<MemberRow | null>(null);

  const { data: statsData } = useQuery(GET_ADMIN_STATS);
  const totalCents = statsData?.platformStats?.totalWalletBalanceCents as number | undefined;
  const totalUsers = (statsData?.platformStats?.totalUsers as number | undefined) ?? 0;

  const { data: membersData, loading: membersLoading } = useQuery(GET_ADMIN_MEMBERS, {
    variables: {
      limit: paginationModel.pageSize,
      offset: paginationModel.page * paginationModel.pageSize,
    },
  });
  const members = (membersData?.adminUsers ?? []) as MemberRow[];

  const { data: txData, loading: txLoading, error: txError } = useQuery(
    GET_ADMIN_USER_TRANSACTIONS,
    {
      variables: { userId: selected?.id ?? "", limit: 20, offset: 0 },
      skip: !selected,
    },
  );
  const txs = (txData?.adminUserTransactions ?? []) as MemberTx[];

  const columns: GridColDef[] = [
    {
      field: "email",
      headerName: "Name",
      flex: 1,
      minWidth: 220,
      renderCell: (params) => (
        <Button
          variant="text"
          size="small"
          onClick={() => setSelected(params.row as MemberRow)}
          sx={{ textTransform: "none", justifyContent: "flex-start", minWidth: 0, px: 0 }}
        >
          {String(params.value ?? "")}
        </Button>
      ),
    },
    { field: "role", headerName: "Role", width: 100 },
    {
      field: "status",
      headerName: "Status",
      width: 120,
      renderCell: (params) => (
        <Chip
          label={String(params.value ?? "")}
          color={params.value === "ACTIVE" ? "success" : "warning"}
          size="small"
        />
      ),
    },
    {
      field: "walletBalanceCents",
      headerName: "Balance",
      width: 140,
      valueFormatter: (value) => formatMoney(Number(value ?? 0)),
    },
    {
      field: "createdAt",
      headerName: "Joined",
      width: 150,
      valueFormatter: (value) => formatTxDate(String(value ?? "")),
    },
  ];

  return (
    <Box>
      <Typography variant="h5" fontWeight="bold" mb={3}>Wallet Balances</Typography>

      <Card sx={{ mb: 3, bgcolor: "primary.light" }}>
        <CardContent>
          <Typography variant="body2" color="primary.dark">Total Wallet Balances</Typography>
          <Typography variant="h4" fontWeight="bold" color="primary.dark">
            {totalCents == null ? "--" : formatMoney(totalCents)}
          </Typography>
        </CardContent>
      </Card>

      <Typography variant="h6" fontWeight="bold" mb={2}>Balances per user</Typography>
      <Box sx={{ height: 500, width: "100%" }}>
        <DataGrid
          rows={members}
          columns={columns}
          loading={membersLoading}
          rowCount={totalUsers}
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

      <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} fullWidth maxWidth="sm">
        <DialogTitle>{selected?.email ?? ""}</DialogTitle>
        <DialogContent dividers>
          {txLoading && (
            <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
              <CircularProgress size={28} />
            </Box>
          )}
          {txError && <Alert severity="error">Could not load transactions.</Alert>}
          {!txLoading && !txError && txs.length === 0 && (
            <Typography variant="body2" color="text.secondary">No transactions yet.</Typography>
          )}
          {!txLoading && !txError && txs.length > 0 && (
            <List disablePadding>
              {txs.map((tx) => (
                <Box key={tx.id}>
                  <ListItem
                    disableGutters
                    secondaryAction={
                      <Typography
                        fontWeight={700}
                        color={tx.direction === "IN" ? "success.main" : "warning.main"}
                      >
                        {tx.direction === "IN" ? "+" : "−"}{formatMoney(tx.amount.cents)}
                      </Typography>
                    }
                  >
                    <ListItemText
                      primary={`${tx.direction === "IN" ? "Received" : "Sent"}${tx.counterparty?.name ? ` · ${tx.counterparty.name}` : ""}`}
                      secondary={`${tx.reference ?? "no ref"} · ${formatTxDate(tx.createdAt)}${tx.description ? ` · ${tx.description}` : ""}`}
                    />
                  </ListItem>
                  <Divider component="li" />
                </Box>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelected(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
