import { useState } from "react";
import { Box, Typography, Pagination, Select, MenuItem, FormControl, InputLabel, Chip } from "@mui/material";
import { useTransactions } from "../hooks/useTransactions";
import TransactionList from "../components/TransactionList";

export default function TransactionsPage() {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("");
  const limit = 20;
  const { transactions, loading } = useTransactions(limit, (page - 1) * limit, filter || undefined);

  if (loading) return <Typography>Loading...</Typography>;

  return (
    <Box>
      <Typography variant="h5" fontWeight="bold" mb={3}>Transaction History</Typography>

      <FormControl size="small" sx={{ mb: 2, minWidth: 150 }}>
        <InputLabel>Filter</InputLabel>
        <Select value={filter} label="Filter" onChange={(e) => { setFilter(e.target.value); setPage(1); }}>
          <MenuItem value="">All</MenuItem>
          <MenuItem value="CASH_IN">Cash In</MenuItem>
          <MenuItem value="CASH_OUT">Cash Out</MenuItem>
          <MenuItem value="SEND">Sent</MenuItem>
          <MenuItem value="RECEIVE">Received</MenuItem>
          <MenuItem value="QR_PAYMENT">QR Payment</MenuItem>
        </Select>
      </FormControl>

      {transactions && <TransactionList transactions={transactions.items} />}

      {transactions && transactions.pagination.total > limit && (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 3 }}>
          <Pagination
            count={Math.ceil(transactions.pagination.total / limit)}
            page={page}
            onChange={(_, p) => setPage(p)}
            color="primary"
          />
        </Box>
      )}
    </Box>
  );
}