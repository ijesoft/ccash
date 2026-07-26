import { useNavigate } from "react-router-dom";
import {
  Box,
  Grid,
  Paper,
  Typography,
  Button,
  Fade,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import CallMergeIcon from "@mui/icons-material/CallMerge";
import RemoveIcon from "@mui/icons-material/Remove";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import { useWallet } from "../hooks/useWallet";
import BalanceCard from "../components/BalanceCard";
import TransactionList from "../components/TransactionList";
import { useTransactions } from "../hooks/useTransactions";

export default function Dashboard() {
  const { wallet, loading } = useWallet();
  const { transactions } = useTransactions(5, 0);
  const navigate = useNavigate();

  if (loading) {
    return (
      <Box sx={{ py: 4 }}>
        <Typography>Loading dashboard...</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Fade in timeout={400}>
        <Typography variant="h5" fontWeight={700} gutterBottom sx={{ fontFamily: '"League Spartan", sans-serif' }}>
          {wallet ? `Welcome back, ${wallet.userId?.slice(0, 8)}` : "Welcome"}
        </Typography>
      </Fade>

      {wallet && <BalanceCard balanceCents={wallet.balance.cents} />}

      <Fade in timeout={500}>
        <Grid container spacing={2} mb={3}>
          <Grid item xs={4}>
            <Paper
              elevation={0}
              sx={{
                p: 2.5, textAlign: "center", cursor: "pointer",
                borderRadius: 3, transition: "transform 0.15s, box-shadow 0.15s",
                "&:active": { transform: "scale(0.96)" },
                "&:hover": { boxShadow: 2, transform: "translateY(-2px)" },
              }}
              onClick={() => navigate("/send")}
            >
              <SendIcon color="primary" sx={{ fontSize: 32, mb: 1 }} />
              <Typography variant="caption" fontWeight={500}>Send</Typography>
            </Paper>
          </Grid>
          <Grid item xs={4}>
            <Paper
              elevation={0}
              sx={{
                p: 2.5, textAlign: "center", cursor: "pointer",
                borderRadius: 3, transition: "transform 0.15s, box-shadow 0.15s",
                "&:active": { transform: "scale(0.96)" },
                "&:hover": { boxShadow: 2, transform: "translateY(-2px)" },
              }}
              onClick={() => navigate("/cash-in")}
            >
              <CallMergeIcon color="success" sx={{ fontSize: 32, mb: 1 }} />
              <Typography variant="caption" fontWeight={500}>Receive</Typography>
            </Paper>
          </Grid>
          <Grid item xs={4}>
            <Paper
              elevation={0}
              sx={{
                p: 2.5, textAlign: "center", cursor: "pointer",
                borderRadius: 3, transition: "transform 0.15s, box-shadow 0.15s",
                "&:active": { transform: "scale(0.96)" },
                "&:hover": { boxShadow: 2, transform: "translateY(-2px)" },
              }}
              onClick={() => navigate("/cash-out")}
            >
              <RemoveIcon color="error" sx={{ fontSize: 32, mb: 1 }} />
              <Typography variant="caption" fontWeight={500}>Cash Out</Typography>
            </Paper>
          </Grid>
        </Grid>
      </Fade>

      <Fade in timeout={600}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
          <Typography variant="subtitle1" fontWeight={600}>Recent Activity</Typography>
          <Button size="small" onClick={() => navigate("/transactions")} sx={{ textTransform: "none", fontWeight: 600 }}>
            See all
          </Button>
        </Box>
      </Fade>

      <Fade in timeout={700}>
        {transactions ? (
          <TransactionList transactions={transactions.items} />
        ) : (
          <Paper elevation={0} sx={{ p: 4, textAlign: "center", borderRadius: 3 }}>
            <AccountBalanceWalletIcon sx={{ fontSize: 40, color: "text.disabled", mb: 1 }} />
            <Typography variant="body2" color="text.secondary">No recent transactions</Typography>
          </Paper>
        )}
      </Fade>
    </Box>
  );
}