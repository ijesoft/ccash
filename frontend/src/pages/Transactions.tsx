import { useState } from "react";
import { Box, Typography, Pagination, Select, MenuItem, FormControl, InputLabel, Paper } from "@mui/material";
import { useTransactions } from "../hooks/useTransactions";
import TransactionList from "../components/TransactionList";

export default function TransactionsPage() {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("");
  const limit = 20;
  const { transactions, loading } = useTransactions(limit, (page - 1) * limit, filter || undefined);

  if (loading) {
    return (
      <Box sx={{ py: 4 }}>
        <Typography>Loading...</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} mb={3} sx={{ fontFamily: '"League Spartan", sans-serif' }}>
        Transaction History
      </Typography>

      <FormControl size="small" sx={{ mb: 2, minWidth: 140 }}>
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
        </Select>
      </FormControl>

      {transactions ? (
        <TransactionList transactions={transactions.items} />
      ) : (
        <Paper elevation={0} sx={{ p: 4, textAlign: "center", borderRadius: 3 }}>
          <Typography variant="body2" color="text.secondary">No transactions found</Typography>
        </Paper>
      )}

      {transactions && transactions.pagination.total > limit && (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 3, pb: 2 }}>
          <Pagination
            count={Math.ceil(transactions.pagination.total / limit)}
            page={page}
            onChange={(_, p) => setPage(p)}
            color="primary"
            shape="rounded"
            size="medium"
          />
        </Box>
      )}
    </Box>
  );
}