import { useNavigate } from "react-router-dom";
import { Box, Grid, Paper, Typography, Button } from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import QrCodeIcon from "@mui/icons-material/QrCode";
import { useWallet } from "../hooks/useWallet";
import BalanceCard from "../components/BalanceCard";
import TransactionList from "../components/TransactionList";
import { useTransactions } from "../hooks/useTransactions";

export default function Dashboard() {
  const { wallet, loading } = useWallet();
  const { transactions } = useTransactions(5, 0);
  const navigate = useNavigate();

  if (loading) return <Typography>Loading...</Typography>;

  return (
    <Box>
      <Typography variant="h5" fontWeight="bold" mb={3}>Dashboard</Typography>

      {wallet && (
        <BalanceCard
          balanceCents={wallet.balance.cents}
          dailyLimitCents={wallet.dailySendLimit.cents}
          dailyUsedCents={wallet.dailySendUsed.cents}
        />
      )}

      {/* QR Payment tile restored in Phase 2.1 */}
      <Grid container spacing={2} mb={3}>
        <Grid xs={6} md={4}>
          <Paper sx={{ p: 2, textAlign: "center", cursor: "pointer" }} onClick={() => navigate("/send")}>
            <SendIcon color="primary" sx={{ fontSize: 32 }} />
            <Typography variant="body2">Send</Typography>
          </Paper>
        </Grid>
        <Grid xs={6} md={4}>
          <Paper sx={{ p: 2, textAlign: "center", cursor: "pointer" }} onClick={() => navigate("/cash-in")}>
            <AddIcon color="success" sx={{ fontSize: 32 }} />
            <Typography variant="body2">Cash In</Typography>
          </Paper>
        </Grid>
        <Grid xs={6} md={4}>
          <Paper sx={{ p: 2, textAlign: "center", cursor: "pointer" }} onClick={() => navigate("/cash-out")}>
            <RemoveIcon color="error" sx={{ fontSize: 32 }} />
            <Typography variant="body2">Cash Out</Typography>
          </Paper>
        </Grid>
        <Grid xs={6} md={4}>
          <Paper sx={{ p: 2, textAlign: "center", cursor: "pointer" }} onClick={() => navigate("/qr-payment")}>
            <QrCodeIcon color="primary" sx={{ fontSize: 32 }} />
            <Typography variant="body2">QR Payment</Typography>
          </Paper>
        </Grid>
      </Grid>

      <Typography variant="h6" mb={2}>Recent Transactions</Typography>
      {transactions && <TransactionList transactions={transactions.items} />}
      <Button onClick={() => navigate("/transactions")} sx={{ mt: 1 }}>View All</Button>
    </Box>
  );
}