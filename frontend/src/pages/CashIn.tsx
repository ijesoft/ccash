import { useState } from "react";
import { Box, Typography, TextField, Button, Alert, Card, CardContent } from "@mui/material";
import { useMutation } from "@apollo/client";
import { CASH_IN } from "../graphql/mutations/transactions";
import { amountToCents } from "../utils/format";

export default function CashIn() {
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ reference: string } | null>(null);
  const [cashIn, { loading }] = useMutation(CASH_IN);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess(null);

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    try {
      const { data } = await cashIn({
        variables: {
          input: {
            amountCents: amountToCents(amountNum),
            idempotencyKey: crypto.randomUUID(),
          },
        },
      });
      setSuccess({ reference: data?.cashIn?.id ?? "" });
      setAmount("");
    } catch (err: any) {
      setError(err.message || "Cash in failed");
    }
  };

  return (
    <Box sx={{ maxWidth: 500, mx: "auto" }}>
      <Typography variant="h5" fontWeight="bold" mb={3}>Cash In</Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Cash in successful! Reference: {success.reference}
        </Alert>
      )}

      <Card>
        <CardContent>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Simulated cash in — funds will be credited to your wallet immediately.
          </Typography>
          <Box component="form" onSubmit={handleSubmit}>
            <TextField fullWidth label="Amount (PHP)" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required sx={{ mb: 3 }} inputProps={{ min: 0, step: 0.01 }} />
            <Button fullWidth type="submit" variant="contained" size="large" disabled={loading}>
              {loading ? "Processing..." : "Cash In"}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}