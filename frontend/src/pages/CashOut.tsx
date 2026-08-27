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
  RadioGroup,
  FormControlLabel,
  Radio,
  Divider,
  MenuItem,
} from "@mui/material";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import StorefrontIcon from "@mui/icons-material/Storefront";
import AtmIcon from "@mui/icons-material/Atm";
import { useMutation } from "@apollo/client";
import { CASH_OUT } from "../graphql/mutations/transactions";
import { GET_WALLET, GET_TRANSACTIONS } from "../graphql/queries/wallet";
import { amountToCents, formatDate } from "../utils/format";
import SuccessDialog from "../components/SuccessDialog";
import type { Transaction } from "../types";

const WITHDRAWAL_CHANNELS = [
  {
    id: "instapay",
    label: "Bank Transfer (InstaPay / PESONet)",
    sublabel: "BPI, BDO, UnionBank, Maya Bank, GCash (Real-time)",
    icon: <AccountBalanceIcon color="primary" />,
  },
  {
    id: "otc_remittance",
    label: "Over-the-Counter Remittance",
    sublabel: "Palawan Express, Cebuana Lhuillier, 7-Eleven",
    icon: <StorefrontIcon color="primary" />,
  },
  {
    id: "atm",
    label: "ATM Cash Out",
    sublabel: "Cardless withdrawal at partner ATMs",
    icon: <AtmIcon color="primary" />,
  },
];

const PHILIPPINE_BANKS = [
  "BDO Unibank",
  "BPI (Bank of the Philippine Islands)",
  "UnionBank of the Philippines",
  "Metrobank",
  "Landbank",
  "RCBC",
  "Maya Bank",
  "GCash",
  "Security Bank",
  "Philippine National Bank (PNB)",
];

export default function CashOut() {
  const navigate = useNavigate();
  const [channel, setChannel] = useState("instapay");
  const [selectedBank, setSelectedBank] = useState(PHILIPPINE_BANKS[0]);
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<Transaction | null>(null);
  const [cashOut, { loading }] = useMutation(CASH_OUT, {
    refetchQueries: [{ query: GET_WALLET }, { query: GET_TRANSACTIONS, variables: { limit: 5, offset: 0 } }],
  });

  const selectedChannelObj = WITHDRAWAL_CHANNELS.find((c) => c.id === channel);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    if (channel === "instapay") {
      if (!accountNumber || accountNumber.length < 6) {
        setError("Please enter a valid bank account number");
        return;
      }
      if (!accountName.trim()) {
        setError("Please enter the account holder name");
        return;
      }
    }

    const desc =
      channel === "instapay"
        ? `Bank Transfer to ${selectedBank} (${accountName.trim()} - ${accountNumber.slice(-4)})`
        : `Cash out via ${selectedChannelObj?.label}`;

    try {
      const { data } = await cashOut({
        variables: {
          input: {
            amountCents: amountToCents(amountNum),
            idempotencyKey: crypto.randomUUID(),
            description: desc,
          },
        },
      });
      if (data?.cashOut) setReceipt(data.cashOut);
      setAmount("");
      setAccountNumber("");
      setAccountName("");
    } catch (err: any) {
      setError(err.message || "Cash out failed");
    }
  };

  return (
    <Box sx={{ maxWidth: 520, mx: "auto" }} className="animate-fade-in">
      <Typography
        fontWeight={700}
        mb={2.5}
        sx={{ fontFamily: '"League Spartan", sans-serif', fontSize: { xs: "1.35rem", sm: "1.5rem" } }}
      >
        Cash Out / Bank Transfer
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

      <Card sx={{ borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography variant="subtitle2" fontWeight={700} mb={1.5}>
            Select Cash Out Method
          </Typography>

          <RadioGroup value={channel} onChange={(e) => setChannel(e.target.value)} sx={{ mb: 2.5 }}>
            {WITHDRAWAL_CHANNELS.map((ch) => (
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
            {channel === "instapay" && (
              <Box sx={{ mb: 2 }}>
                <TextField
                  select
                  fullWidth
                  label="Destination Bank"
                  value={selectedBank}
                  onChange={(e) => setSelectedBank(e.target.value)}
                  sx={{ mb: 2 }}
                >
                  {PHILIPPINE_BANKS.map((b) => (
                    <MenuItem key={b} value={b}>
                      {b}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  fullWidth
                  label="Account Holder Name"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  required
                  placeholder="e.g. Juan Dela Cruz"
                  sx={{ mb: 2 }}
                />
                <TextField
                  fullWidth
                  label="Account Number"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  required
                  placeholder="10-12 digit account number"
                  inputProps={{ inputMode: "numeric" }}
                  sx={{ mb: 2 }}
                />
              </Box>
            )}

            <TextField
              fullWidth
              label="Amount (PHP)"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              sx={{ mb: 3 }}
              inputProps={{ min: 1, step: 0.01, inputMode: "decimal" }}
              helperText="Fee: ₱0.00 (Free InstaPay Transfer promo)"
            />
            <Button fullWidth type="submit" variant="contained" size="large" disabled={loading} sx={{ minHeight: 48, borderRadius: 2 }}>
              {loading ? "Processing Transfer..." : `Withdraw via ${selectedChannelObj?.label}`}
            </Button>
          </Box>
        </CardContent>
      </Card>

      <SuccessDialog
        open={!!receipt}
        onClose={() => setReceipt(null)}
        title="Cash Out Successful"
        subtitle="Funds have been transferred to destination"
        amountCents={receipt?.amount.cents ?? 0}
        signPrefix="−"
        rows={[
          { label: "Method", value: selectedChannelObj?.label ?? "Bank Transfer" },
          ...(channel === "instapay" && accountName ? [{ label: "Recipient", value: `${accountName} (${selectedBank})` }] : []),
          { label: "Date", value: receipt ? formatDate(receipt.createdAt) : "—" },
          { label: "Fee", value: "₱0.00 (Free)" },
        ]}
        reference={receipt?.reference ?? receipt?.id}
        primaryLabel="Done"
        onPrimary={() => {
          setReceipt(null);
          navigate("/");
        }}
        secondaryLabel="Cash out again"
        onSecondary={() => setReceipt(null)}
      />
    </Box>
  );
}

