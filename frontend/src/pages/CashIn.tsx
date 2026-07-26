import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Typography, TextField, Button, Alert, Card, CardContent, Stack, Chip } from "@mui/material";
import { useMutation } from "@apollo/client";
import { CASH_IN } from "../graphql/mutations/transactions";
import { GET_WALLET, GET_TRANSACTIONS } from "../graphql/queries/wallet";
import { amountToCents, formatDate } from "../utils/format";
import SuccessDialog from "../components/SuccessDialog";
import type { Transaction } from "../types";

const QUICK_AMOUNTS = [100, 500, 1000, 5000];

export default function CashIn() {
  const navigate = useNavigate();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<Transaction | null>(null);
  const [cashIn, { loading }] = useMutation(CASH_IN, {
    refetchQueries: [{ query: GET_WALLET }, { query: GET_TRANSACTIONS, variables: { limit: 5, offset: 0 } }],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

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
      if (data?.cashIn) setReceipt(data.cashIn);
      setAmount("");
    } catch (err: any) {
      setError(err.message || "Cash in failed");
    }
  };

  return (
    <Box sx={{ maxWidth: 500, mx: "auto" }} className="animate-fade-in">
      <Typography
        fontWeight={700}
        mb={2.5}
        sx={{ fontFamily: '"League Spartan", sans-serif', fontSize: { xs: "1.35rem", sm: "1.5rem" } }}
      >
        Cash In
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

      <Card sx={{ borderRadius: 3 }}>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Simulated cash in — funds will be credited to your wallet immediately.
          </Typography>
          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Amount (PHP)"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              sx={{ mb: 2 }}
              inputProps={{ min: 0, step: 0.01, inputMode: "decimal" }}
            />
            <Stack direction="row" spacing={1} sx={{ mb: 3, flexWrap: "wrap", gap: 1 }}>
              {QUICK_AMOUNTS.map((quick) => (
                <Chip
                  key={quick}
                  label={`₱${quick.toLocaleString()}`}
                  onClick={() => setAmount(String(quick))}
                  variant={amount === String(quick) ? "filled" : "outlined"}
                  color={amount === String(quick) ? "primary" : "default"}
                  sx={{ cursor: "pointer", ml: "0 !important" }}
                />
              ))}
            </Stack>
            <Button fullWidth type="submit" variant="contained" size="large" disabled={loading} sx={{ minHeight: 48 }}>
              {loading ? "Processing..." : "Cash In"}
            </Button>
          </Box>
        </CardContent>
      </Card>

      <SuccessDialog
        open={!!receipt}
        onClose={() => setReceipt(null)}
        title="Cash In Successful"
        subtitle="Your wallet has been credited"
        amountCents={receipt?.amount.cents ?? 0}
        signPrefix="+"
        rows={[
          { label: "Type", value: "Cash In" },
          { label: "Date", value: receipt ? formatDate(receipt.createdAt) : "—" },
        ]}
        reference={receipt?.reference ?? receipt?.id}
        primaryLabel="Done"
        onPrimary={() => {
          setReceipt(null);
          navigate("/");
        }}
        secondaryLabel="Cash in again"
        onSecondary={() => setReceipt(null)}
      />
    </Box>
  );
}
