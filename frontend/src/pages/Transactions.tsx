import { useState } from "react";
import {
  Box,
  Typography,
  Pagination,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Paper,
  Button,
  Stack,
  Snackbar,
  Alert,
  CircularProgress,
} from "@mui/material";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import TableChartIcon from "@mui/icons-material/TableChart";
import EmailIcon from "@mui/icons-material/Email";
import { useTransactions } from "../hooks/useTransactions";
import TransactionList from "../components/TransactionList";
import TransactionReceiptDialog from "../components/TransactionReceiptDialog";
import type { Transaction } from "../types";
import { downloadReport, emailReport } from "../utils/reportDownload";

export default function TransactionsPage() {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<"pdf" | "xlsx" | "email" | null>(null);
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({
    open: false,
    message: "",
    severity: "success",
  });
  const limit = 20;
  const { transactions, loading } = useTransactions(limit, (page - 1) * limit, filter || undefined);

  const handleDownload = async (kind: "pdf" | "xlsx") => {
    setBusy(kind);
    try {
      await downloadReport(`/api/reports/transactions.${kind}`, `campe-wallet-transactions.${kind}`);
    } catch (err: any) {
      setSnackbar({ open: true, message: err.message || "Download failed", severity: "error" });
    } finally {
      setBusy(null);
    }
  };

  const handleEmail = async () => {
    setBusy("email");
    try {
      const result = await emailReport("/api/reports/transactions/email");
      setSnackbar({ open: true, message: `Transaction history is being sent to ${result.email}`, severity: "success" });
    } catch (err: any) {
      setSnackbar({ open: true, message: err.message || "Could not send email", severity: "error" });
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <Box sx={{ py: 4 }}>
        <Typography>Loading...</Typography>
      </Box>
    );
  }

  return (
    <Box className="animate-fade-in">
      <Typography
        fontWeight={700}
        mb={2.5}
        sx={{ fontFamily: '"League Spartan", sans-serif', fontSize: { xs: "1.35rem", sm: "1.5rem" } }}
      >
        Transaction History
      </Typography>

      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: "wrap", rowGap: 1 }}>
        <FormControl size="small" sx={{ minWidth: { xs: "100%", sm: 160 } }}>
          <InputLabel>Filter</InputLabel>
          <Select
            value={filter}
            label="Filter"
            onChange={(e) => { setFilter(e.target.value); setPage(1); }}
            sx={{ borderRadius: 2 }}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="CASH_IN">Cash In</MenuItem>
            <MenuItem value="CASH_OUT">Cash Out</MenuItem>
            <MenuItem value="SEND">Transfers</MenuItem>
            <MenuItem value="QR_PAYMENT">QR Payment</MenuItem>
          </Select>
        </FormControl>

        <Box sx={{ flexGrow: 1 }} />

        <Button
          size="small"
          variant="outlined"
          startIcon={busy === "pdf" ? <CircularProgress size={16} /> : <PictureAsPdfIcon />}
          disabled={busy !== null}
          onClick={() => handleDownload("pdf")}
          sx={{ borderRadius: 2 }}
        >
          PDF
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={busy === "xlsx" ? <CircularProgress size={16} /> : <TableChartIcon />}
          disabled={busy !== null}
          onClick={() => handleDownload("xlsx")}
          sx={{ borderRadius: 2 }}
        >
          Excel
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={busy === "email" ? <CircularProgress size={16} /> : <EmailIcon />}
          disabled={busy !== null}
          onClick={handleEmail}
          sx={{ borderRadius: 2 }}
        >
          Email me
        </Button>
      </Stack>

      {transactions ? (
        <Paper elevation={0} sx={{ borderRadius: 3, border: "1px solid", borderColor: "divider", overflow: "hidden" }}>
          <TransactionList transactions={transactions.items} onSelect={setSelected} />
        </Paper>
      ) : (
        <Paper elevation={0} sx={{ p: 4, textAlign: "center", borderRadius: 3 }}>
          <Typography variant="body2" color="text.secondary">No transactions found</Typography>
        </Paper>
      )}

      {transactions && transactions.pagination.total > limit && (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 3, pb: 2, overflowX: "auto" }}>
          <Pagination
            count={Math.ceil(transactions.pagination.total / limit)}
            page={page}
            onChange={(_, p) => setPage(p)}
            color="primary"
            shape="rounded"
            size="small"
            siblingCount={0}
          />
        </Box>
      )}

      <TransactionReceiptDialog transaction={selected} onClose={() => setSelected(null)} />

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
