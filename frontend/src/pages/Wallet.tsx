import { useState } from "react";
import { Box, Typography, TextField, Button, Alert, Card, CardContent, Paper } from "@mui/material";
import LockIcon from "@mui/icons-material/Lock";
import { useWallet } from "../hooks/useWallet";
import BalanceCard from "../components/BalanceCard";
import { useMutation, gql } from "@apollo/client";
import { formatMoney } from "../utils/format";

const SET_PIN = gql`
  mutation SetPin($pin: String!) {
    setPin(pin: $pin)
  }
`;

export default function WalletPage() {
  const { wallet, loading } = useWallet();
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinSuccess, setPinSuccess] = useState(false);
  const [setPinMutation, { loading: pinLoading }] = useMutation(SET_PIN);

  if (loading) {
    return <Typography>Loading...</Typography>;
  }

  const handleSetPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError("");
    setPinSuccess(false);
    try {
      await setPinMutation({ variables: { pin } });
      setPinSuccess(true);
      setPin("");
    } catch (err: any) {
      setPinError(err.message || "Failed to set PIN");
    }
  };

  return (
    <Box className="animate-fade-in">
      <Typography
        fontWeight={700}
        mb={2.5}
        sx={{ fontFamily: '"League Spartan", sans-serif', fontSize: { xs: "1.35rem", sm: "1.5rem" } }}
      >
        My Wallet
      </Typography>

      {wallet && (
        <BalanceCard
          balanceCents={wallet.balance.cents}
          dailyLimitCents={wallet.dailySendLimit?.cents}
          dailyUsedCents={wallet.dailySendUsed?.cents}
        />
      )}

      {wallet && (
        <Paper
          elevation={0}
          sx={{
            p: { xs: 2, sm: 2.5 },
            mb: 3,
            borderRadius: 3,
            border: "1px solid",
            borderColor: "divider",
          }}
        >
          <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
            Daily Send Limit
          </Typography>
          <Typography variant="body2" fontWeight={600} mb={1}>
            {formatMoney(wallet.dailySendUsed.cents)} / {formatMoney(wallet.dailySendLimit.cents)}
          </Typography>
          <Box
            sx={{
              height: 6,
              bgcolor: "divider",
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <Box
              sx={{
                width: `${Math.min((wallet.dailySendUsed.cents / wallet.dailySendLimit.cents) * 100, 100)}%`,
                height: "100%",
                bgcolor: "primary.main",
                borderRadius: 3,
                transition: "width 0.3s ease",
              }}
            />
          </Box>
        </Paper>
      )}

      <Card sx={{ borderRadius: 3 }}>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography variant="h6" fontWeight={600} mb={2} sx={{ display: "flex", alignItems: "center", gap: 1, fontSize: "1rem" }}>
            <LockIcon fontSize="small" color="action" />
            Set Transaction PIN
          </Typography>

          {pinError && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{pinError}</Alert>}
          {pinSuccess && <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>PIN set successfully</Alert>}

          <Box
            component="form"
            onSubmit={handleSetPin}
            sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: 1.5 }}
          >
            <TextField
              label="4-6 digit MPIN"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              inputProps={{ maxLength: 6, inputMode: "numeric" }}
              type="password"
              required
              fullWidth
            />
            <Button
              type="submit"
              variant="contained"
              disabled={pinLoading}
              sx={{ borderRadius: 2, px: 3, minHeight: 48, whiteSpace: "nowrap", flexShrink: 0 }}
            >
              {pinLoading ? "Saving..." : "Set PIN"}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
