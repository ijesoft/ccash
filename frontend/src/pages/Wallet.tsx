import { useState } from "react";
import { Box, Typography, TextField, Button, Alert } from "@mui/material";
import { useWallet } from "../hooks/useWallet";
import BalanceCard from "../components/BalanceCard";
import { useMutation, gql } from "@apollo/client";

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

  if (loading) return <Typography>Loading...</Typography>;

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
    <Box>
      <Typography variant="h5" fontWeight="bold" mb={3}>My Wallet</Typography>
      {wallet && <BalanceCard balanceCents={wallet.balance.cents} />}

      <Box mt={3}>
        <Typography variant="h6" mb={2}>Set Transaction PIN</Typography>
        {pinError && <Alert severity="error" sx={{ mb: 2 }}>{pinError}</Alert>}
        {pinSuccess && <Alert severity="success" sx={{ mb: 2 }}>PIN set successfully</Alert>}
        <Box component="form" onSubmit={handleSetPin} sx={{ display: "flex", gap: 2, maxWidth: 300 }}>
          <TextField label="4-6 digit PIN" value={pin} onChange={(e) => setPin(e.target.value)} inputProps={{ maxLength: 6 }} type="password" required />
          <Button type="submit" variant="contained" disabled={pinLoading}>{pinLoading ? "Saving..." : "Set PIN"}</Button>
        </Box>
      </Box>
    </Box>
  );
}