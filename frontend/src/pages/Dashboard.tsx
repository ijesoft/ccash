import { useNavigate } from "react-router-dom";
import {
  Box,
  Paper,
  Typography,
  Button,
  Fade,
  Skeleton,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import CallReceivedIcon from "@mui/icons-material/CallReceived";
import CallMadeIcon from "@mui/icons-material/CallMade";
import QrCodeIcon from "@mui/icons-material/QrCode";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import { useWallet } from "../hooks/useWallet";
import { useAuth } from "../context/AuthContext";
import BalanceCard from "../components/BalanceCard";
import TransactionList from "../components/TransactionList";
import { useTransactions } from "../hooks/useTransactions";

const allActions = [
  { label: "Send", path: "/send", icon: <SendIcon />, color: "#0f6ecd", bg: "#e3f0fc" },
  { label: "Cash In", path: "/cash-in", icon: <CallReceivedIcon />, color: "#00b894", bg: "#e0faf3" },
  { label: "Cash Out", path: "/cash-out", icon: <CallMadeIcon />, color: "#e74c3c", bg: "#fde8e8" },
  { label: "QR Pay", path: "/qr-payment", icon: <QrCodeIcon />, color: "#6c5ce7", bg: "#eee8ff" },
];

const ADMIN_ONLY_PATHS = ["/cash-in", "/cash-out"];

export default function Dashboard() {
  const { wallet, loading } = useWallet();
  const { transactions, loading: txLoading } = useTransactions(5, 0);
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();

  const actions = isAdmin ? allActions : allActions.filter((a) => !ADMIN_ONLY_PATHS.includes(a.path));
  const greetingName = user?.email?.split("@")[0] ?? "there";

  if (loading) {
    return (
      <Box>
        <Skeleton variant="text" width={200} height={36} sx={{ mb: 2 }} />
        <Skeleton variant="rounded" height={140} sx={{ mb: 3, borderRadius: 3 }} />
        <Box sx={{ display: "grid", gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))`, gap: 1.5, mb: 3 }}>
          {Array.from({ length: actions.length }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={88} sx={{ borderRadius: 3 }} />
          ))}
        </Box>
        <Skeleton variant="rounded" height={200} sx={{ borderRadius: 3 }} />
      </Box>
    );
  }

  return (
    <Box className="animate-fade-in">
      <Fade in timeout={400}>
        <Box sx={{ mb: { xs: 2, sm: 2.5 } }}>
          <Typography
            variant="overline"
            color="text.secondary"
            sx={{ display: "block", mb: 0.25 }}
          >
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
          </Typography>
          <Typography
            fontWeight={700}
            sx={{
              fontFamily: '"League Spartan", sans-serif',
              fontSize: { xs: "1.35rem", sm: "1.6rem" },
              letterSpacing: "-0.02em",
              lineHeight: 1.2,
            }}
          >
            Welcome back, {greetingName}
          </Typography>
        </Box>
      </Fade>

      {wallet && (
        <BalanceCard
          balanceCents={wallet.balance.cents}
          dailyLimitCents={wallet.dailySendLimit?.cents}
          dailyUsedCents={wallet.dailySendUsed?.cents}
        />
      )}

      <Fade in timeout={500}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))`,
            gap: { xs: 1, sm: 1.5 },
            mb: { xs: 2.5, sm: 3 },
          }}
        >
          {actions.map((action) => (
            <Paper
              key={action.path}
              elevation={0}
              onClick={() => navigate(action.path)}
              sx={{
                p: { xs: 1.25, sm: 2 },
                textAlign: "center",
                cursor: "pointer",
                borderRadius: 3,
                border: "1px solid",
                borderColor: "divider",
                transition: "transform 0.15s, box-shadow 0.15s",
                minHeight: { xs: 84, sm: 100 },
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                "&:active": { transform: "scale(0.96)" },
                "&:hover": { boxShadow: "0 6px 16px rgba(15,110,205,0.1)", transform: "translateY(-2px)" },
              }}
            >
              <Box
                sx={{
                  width: { xs: 40, sm: 44 },
                  height: { xs: 40, sm: 44 },
                  borderRadius: 2.5,
                  bgcolor: action.bg,
                  color: action.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  mb: 0.75,
                }}
              >
                {action.icon}
              </Box>
              <Typography
                variant="caption"
                fontWeight={600}
                sx={{ fontSize: { xs: "0.65rem", sm: "0.75rem" }, lineHeight: 1.2 }}
              >
                {action.label}
              </Typography>
            </Paper>
          ))}
        </Box>
      </Fade>

      <Fade in timeout={600}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ fontSize: { xs: "0.95rem", sm: "1rem" } }}>
            Recent Activity
          </Typography>
          <Button size="small" onClick={() => navigate("/transactions")} sx={{ fontWeight: 600, minHeight: 40 }}>
            See all
          </Button>
        </Box>
      </Fade>

      <Fade in timeout={700}>
        <Paper elevation={0} sx={{ borderRadius: 3, border: "1px solid", borderColor: "divider", overflow: "hidden" }}>
          {txLoading ? (
            <Box sx={{ p: 2 }}>
              <Skeleton height={56} />
              <Skeleton height={56} />
              <Skeleton height={56} />
            </Box>
          ) : transactions?.items?.length ? (
            <TransactionList transactions={transactions.items} />
          ) : (
            <Box sx={{ p: 4, textAlign: "center" }}>
              <AccountBalanceWalletIcon sx={{ fontSize: 40, color: "text.disabled", mb: 1 }} />
              <Typography variant="body2" color="text.secondary">
                No recent transactions
              </Typography>
              <Button variant="outlined" size="small" sx={{ mt: 2 }} onClick={() => navigate(isAdmin ? "/cash-in" : "/send")}>
                {isAdmin ? "Cash in to get started" : "Send money to get started"}
              </Button>
            </Box>
          )}
        </Paper>
      </Fade>
    </Box>
  );
}
