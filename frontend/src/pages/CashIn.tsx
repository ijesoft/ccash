import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  Card,
  CardContent,
  Stack,
  Chip,
  RadioGroup,
  FormControlLabel,
  Radio,
  Divider,
} from "@mui/material";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import StorefrontIcon from "@mui/icons-material/Storefront";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import PhoneAndroidIcon from "@mui/icons-material/PhoneAndroid";
import { useMutation } from "@apollo/client";
import { CASH_IN } from "../graphql/mutations/transactions";
import { GET_WALLET, GET_TRANSACTIONS } from "../graphql/queries/wallet";
import { amountToCents, formatDate } from "../utils/format";
import SuccessDialog from "../components/SuccessDialog";
import type { Transaction } from "../types";

const QUICK_AMOUNTS = [100, 500, 1000, 2000, 5000];

const PAYMENT_CHANNELS = [
  {
    id: "online_banking",
    label: "Online Banking / InstaPay",
    sublabel: "BPI, BDO, UnionBank, Metrobank (Instant)",
    icon: <AccountBalanceIcon color="primary" />,
  },
  {
    id: "ewallet",
    label: "GCash / Maya",
    sublabel: "Link or transfer from GCash / Maya",
    icon: <PhoneAndroidIcon color="primary" />,
  },
  {
    id: "otc",
    label: "Over-the-Counter (7-Eleven / SM / Cebuana)",
    sublabel: "Pay cash at any partner outlet",
    icon: <StorefrontIcon color="primary" />,
  },
  {
    id: "debit_card",
    label: "Debit / Credit Card",
    sublabel: "Mastercard & Visa accepted",
    icon: <CreditCardIcon color="primary" />,
  },
];

export default function CashIn() {
  const navigate = useNavigate();
  const [channel, setChannel] = useState("online_banking");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<Transaction | null>(null);
  const [cashIn, { loading }] = useMutation(CASH_IN, {
    refetchQueries: [{ query: GET_WALLET }, { query: GET_TRANSACTIONS, variables: { limit: 5, offset: 0 } }],
  });

  const selectedChannelObj = PAYMENT_CHANNELS.find((c) => c.id === channel);

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
            description: `Cash in via ${selectedChannelObj?.label || "Standard Channel"}`,
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
    <Box sx={{ maxWidth: 520, mx: "auto" }} className="animate-fade-in">
      <Typography
        fontWeight={700}
        mb={2.5}
        sx={{ fontFamily: '"League Spartan", sans-serif', fontSize: { xs: "1.35rem", sm: "1.5rem" } }}
      >
        Cash In / Top Up
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

      <Card sx={{ borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography variant="subtitle2" fontWeight={700} mb={1.5}>
            Select Payment Method
          </Typography>

          <RadioGroup value={channel} onChange={(e) => setChannel(e.target.value)} sx={{ mb: 2.5 }}>
            {PAYMENT_CHANNELS.map((ch) => (
              <Box
                key={ch.id}
                onClick={() => setChannel(ch.id)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  p: 1.5,
                  mb: 1,
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: channel === ch.id ? "primary.main" : "grey.200",
                  bgcolor: channel === ch.id ? "primary.50" : "transparent",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                  {ch.icon}
                  <Box>
                    <Typography variant="body2" fontWeight={600}>
                      {ch.label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {ch.sublabel}
                    </Typography>
                  </Box>
                </Box>
                <FormControlLabel
                  value={ch.id}
                  control={<Radio size="small" />}
                  label=""
                  sx={{ m: 0 }}
                />
              </Box>
            ))}
          </RadioGroup>

          <Divider sx={{ my: 2 }} />

          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Amount (PHP)"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              sx={{ mb: 2 }}
              inputProps={{ min: 1, step: 0.01, inputMode: "decimal" }}
              helperText="Minimum PHP 1.00 • No transaction fee"
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
            <Button fullWidth type="submit" variant="contained" size="large" disabled={loading} sx={{ minHeight: 48, borderRadius: 2 }}>
              {loading ? "Processing Top Up..." : `Proceed to Cash In (${selectedChannelObj?.label})`}
            </Button>
          </Box>
        </CardContent>
      </Card>

      <SuccessDialog
        open={!!receipt}
        onClose={() => setReceipt(null)}
        title="Cash In Successful"
        subtitle="Your wallet has been credited immediately"
        amountCents={receipt?.amount.cents ?? 0}
        signPrefix="+"
        rows={[
          { label: "Channel", value: selectedChannelObj?.label ?? "Standard Method" },
          { label: "Date", value: receipt ? formatDate(receipt.createdAt) : "—" },
          { label: "Fee", value: "₱0.00 (Free)" },
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

