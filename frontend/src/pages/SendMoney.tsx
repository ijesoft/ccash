import { useState } from "react";
import { Box, Typography, TextField, Button, Alert, Card, CardContent } from "@mui/material";
import { useMutation } from "@apollo/client";
import { SEND_MONEY } from "../graphql/mutations/transactions";
import { amountToCents, formatMoney } from "../utils/format";

export default function SendMoney() {
  const [receiverId, setReceiverId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [sendMoney, { loading }] = useMutation(SEND_MONEY);

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
      await sendMoney({
        variables: {
          input: {
            receiverWalletId: receiverId,
            amountCents: amountToCents(amountNum),
            idempotencyKey: crypto.randomUUID(),
            description: description || undefined,
          },
        },
      });
      setSuccess(true);
      setAmount("");
      setDescription("");
    } catch (err: any) {
      setError(err.message || "Transfer failed");
    }
  };

  return (
    <Box sx={{ maxWidth: 500, mx: "auto" }}>
      <Typography variant="h5" fontWeight="bold" mb={3}>Send Money</Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>Money sent successfully!</Alert>}

      <Card>
        <CardContent>
          <Box component="form" onSubmit={handleSubmit}>
            <TextField fullWidth label="Recipient Wallet ID" value={receiverId} onChange={(e) => setReceiverId(e.target.value)} required sx={{ mb: 2 }} />
            <TextField fullWidth label="Amount (PHP)" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required sx={{ mb: 2 }} inputProps={{ min: 0, step: 0.01 }} />
            <TextField fullWidth label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} sx={{ mb: 3 }} multiline rows={2} />
            <Button fullWidth type="submit" variant="contained" size="large" disabled={loading}>
              {loading ? "Sending..." : "Send Money"}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}