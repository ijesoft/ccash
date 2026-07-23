import { useState } from "react";
import { Box, Typography, TextField, Button, Alert, Card, CardContent } from "@mui/material";
import { useMutation } from "@apollo/client";
import { CASH_OUT } from "../graphql/mutations/transactions";
import { amountToCents } from "../utils/format";

export default function CashOut() {
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [cashOut, { loading }] = useMutation(CASH_OUT);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess(false);

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    try {
      await cashOut({
        variables: {
          input: {
            amountCents: amountToCents(amountNum),
            idempotencyKey: crypto.randomUUID(),
          },
        },
      });
      setSuccess(true);
      setAmount("");
    } catch (err: any) {
      setError(err.message || "Cash out failed");
    }
  };

  return (
    <Box sx={{ maxWidth: 500, mx: "auto" }}>
      <Typography variant="h5" fontWeight="bold" mb={3}>Cash Out</Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>Cash out successful!</Alert>}

      <Card>
        <CardContent>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Simulated cash out — funds will be debited from your wallet.
          </Typography>
          <Box component="form" onSubmit={handleSubmit}>
            <TextField fullWidth label="Amount (PHP)" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required sx={{ mb: 3 }} inputProps={{ min: 0, step: 0.01 }} />
            <Button fullWidth type="submit" variant="contained" size="large" disabled={loading}>
              {loading ? "Processing..." : "Cash Out"}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}