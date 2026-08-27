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
  Step,
  StepLabel,
  Stepper,
  Chip,
  Avatar,
  Fade,
} from "@mui/material";
import { useMutation, useQuery, useLazyQuery, gql } from "@apollo/client";
import { SEND_MONEY } from "../graphql/mutations/transactions";
import { GET_FAVORITES, GET_WALLET, GET_TRANSACTIONS } from "../graphql/queries/wallet";
import { amountToCents, formatDate, formatMoney } from "../utils/format";
import SuccessDialog from "../components/SuccessDialog";
import type { Favorite, Transaction } from "../types";

const RESOLVE_RECIPIENT = gql`
  query ResolveRecipient($mobile: String!) {
    resolveRecipient(mobile: $mobile) {
      walletId
      name
      maskedMobile
    }
  }
`;

const STEPS = ["Recipient", "Amount", "Confirm"];

export default function SendMoney() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [mobile, setMobile] = useState("");
  const [mobileError, setMobileError] = useState("");
  const [recipient, setRecipient] = useState<{ walletId: string; name: string; maskedMobile: string } | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<{ tx: Transaction; recipientLabel: string; note: string } | null>(null);
  const { data: favsData } = useQuery<{ favorites: Favorite[] }>(GET_FAVORITES);
  const [resolveRecipient, { loading: resolving }] = useLazyQuery(RESOLVE_RECIPIENT);
  const [sendMoneyMut, { loading }] = useMutation(SEND_MONEY, {
    refetchQueries: [{ query: GET_WALLET }, { query: GET_TRANSACTIONS, variables: { limit: 5, offset: 0 } }],
  });

  const resetForm = () => {
    setStep(0);
    setMobile("");
    setRecipient(null);
    setAmount("");
    setNote("");
    setPin("");
  };

  // Best-practice: strict 11-digit numeric-only check, then DB existence check.
  // No silent cleaning - if raw input contains letters/symbols, reject immediately.
  const validateMobileStrict = (raw: string): string | null => {
    const trimmed = raw.trim();
    if (!trimmed) return "Mobile number is required";
    if (/\D/.test(trimmed)) {
      return "Mobile number must contain digits only (no letters, spaces, or symbols)";
    }
    if (trimmed.length !== 11) {
      return "Mobile number must be exactly 11 digits (e.g. 09171234567)";
    }
    if (!/^\d{11}$/.test(trimmed)) {
      return "Mobile number must be exactly 11 digits";
    }
    return null;
  };

  const handleResolveMobile = async () => {
    setError("");
    setMobileError("");
    const raw = mobile.trim();

    const validationError = validateMobileStrict(raw);
    if (validationError) {
      setMobileError(validationError);
      setError(validationError);
      return;
    }

    // At this point raw is guaranteed 11 digits numeric-only -> use as canonical
    const canonical = raw;

    try {
      const { data } = await resolveRecipient({ variables: { mobile: canonical } });
      if (data?.resolveRecipient) {
        setRecipient(data.resolveRecipient);
        setMobile(canonical);
        setStep(1);
      } else {
        const msg = "No account found for that number - please check the mobile number";
        setMobileError(msg);
        setError(msg);
      }
    } catch (err: any) {
      const msg = err.message || "Failed to look up recipient";
      // Surface backend validation (e.g. 11-digit rule) as field error
      if (msg.toLowerCase().includes("mobile") || msg.toLowerCase().includes("digit")) {
        setMobileError(msg);
      }
      setError(msg);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Defense-in-depth: re-validate mobile at send time (user could bypass step 0 via devtools)
    const mobileErr = validateMobileStrict(mobile);
    if (mobileErr) {
      setMobileError(mobileErr);
      setError(mobileErr);
      setStep(0);
      return;
    }
    if (!recipient) {
      const msg = "Recipient not verified - please re-enter the 11-digit mobile number and verify it exists";
      setError(msg);
      setMobileError(msg);
      setStep(0);
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError("Enter a valid amount");
      return;
    }
    if (!pin || pin.length < 4) {
      setError("Enter your MPIN");
      return;
    }

    const canonical = mobile.trim();
    const recipientLabel = recipient?.name || recipient?.maskedMobile || canonical;
    const sentNote = note;

    try {
      const { data } = await sendMoneyMut({
        variables: {
          input: {
            receiverMobile: canonical,
            amountCents: amountToCents(amountNum),
            idempotencyKey: crypto.randomUUID(),
            description: note || undefined,
            pin: pin,
          },
        },
      });
      if (data?.sendMoney) {
        setReceipt({ tx: data.sendMoney, recipientLabel, note: sentNote });
      }
      resetForm();
    } catch (err: any) {
      setError(err.message || "Transfer failed");
    }
  };

  const handleSelectFavorite = (fav: Favorite) => {
    setMobile(fav.accountIdentifier);
    setRecipient(null);
  };

  return (
    <Box sx={{ maxWidth: 520, mx: "auto" }} className="animate-fade-in">
      <Typography
        fontWeight={700}
        mb={2}
        sx={{ fontFamily: '"League Spartan", sans-serif', fontSize: { xs: "1.35rem", sm: "1.5rem" } }}
      >
        Send Money
      </Typography>

      <Stepper
        activeStep={step}
        alternativeLabel
        sx={{
          mb: 3,
          "& .MuiStepLabel-label": {
            fontWeight: 500,
            fontSize: { xs: "0.7rem", sm: "0.8rem" },
          },
        }}
      >
        {STEPS.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

      <Card sx={{ borderRadius: 3 }}>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          {step === 0 && (
            <Fade in timeout={300}>
              <Box component="form" onSubmit={(e) => { e.preventDefault(); handleResolveMobile(); }}>
                {favsData?.favorites && favsData.favorites.length > 0 && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                      Saved recipients
                    </Typography>
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                      {favsData.favorites.map((fav) => (
                        <Chip
                          key={fav.id}
                          label={`${fav.name}`}
                          onClick={() => handleSelectFavorite(fav)}
                          sx={{ cursor: "pointer", maxWidth: "100%" }}
                          variant="outlined"
                          size="small"
                        />
                      ))}
                    </Box>
                  </Box>
                )}
                <TextField
                  fullWidth
                  label="Mobile number"
                  value={mobile}
                  onChange={(e) => {
                    setMobile(e.target.value);
                    if (mobileError) setMobileError("");
                    if (error) setError("");
                  }}
                  onBlur={() => {
                    if (mobile) {
                      const err = validateMobileStrict(mobile);
                      if (err) setMobileError(err);
                    }
                  }}
                  required
                  error={!!mobileError}
                  helperText={mobileError || "Exactly 11 digits (e.g. 09171234567) — digits only, no letters or symbols"}
                  inputProps={{ maxLength: 11, inputMode: "numeric", pattern: "[0-9]*" }}
                  placeholder="09171234567"
                  sx={{ mb: 3 }}
                />
                <Button fullWidth type="submit" variant="contained" size="large" disabled={resolving} sx={{ borderRadius: 2, py: 1.4 }}>
                  {resolving ? "Looking up..." : "Continue"}
                </Button>
              </Box>
            </Fade>
          )}

          {step === 1 && recipient && (
            <Fade in timeout={300}>
              <Box>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                    mb: 3,
                    p: 2,
                    bgcolor: "grey.50",
                    borderRadius: 2,
                  }}
                >
                  <Avatar sx={{ bgcolor: "primary.main", width: 48, height: 48 }}>
                    {recipient.name.charAt(0) || "?"}
                  </Avatar>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle1" fontWeight={600} noWrap>
                      {recipient.name || "Recipient"}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {recipient.maskedMobile}
                    </Typography>
                  </Box>
                </Box>
                <TextField
                  fullWidth
                  label="Amount (PHP)"
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  sx={{ mb: 2 }}
                  inputProps={{ min: 1, step: 0.01, inputMode: "decimal" }}
                />
                <TextField
                  fullWidth
                  label="Note (optional)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  sx={{ mb: 3 }}
                  multiline
                  rows={2}
                />
                <Box sx={{ display: "flex", flexDirection: { xs: "column-reverse", sm: "row" }, gap: 1.5 }}>
                  <Button variant="outlined" onClick={() => setStep(0)} sx={{ borderRadius: 2, minHeight: 48 }}>
                    Back
                  </Button>
                  <Button fullWidth variant="contained" onClick={() => setStep(2)} sx={{ borderRadius: 2, minHeight: 48 }}>
                    Continue
                  </Button>
                </Box>
              </Box>
            </Fade>
          )}

          {step === 2 && (
            <Fade in timeout={300}>
              <Box component="form" onSubmit={handleSend}>
                <Box sx={{ p: { xs: 2, sm: 2.5 }, bgcolor: "grey.50", borderRadius: 2, mb: 3, textAlign: "center" }}>
                  <Typography variant="caption" color="text.secondary" display="block">
                    You are sending
                  </Typography>
                  <Typography
                    fontWeight={700}
                    color="primary.main"
                    sx={{ fontFamily: '"League Spartan", sans-serif', fontSize: { xs: "1.75rem", sm: "2rem" }, my: 0.5 }}
                  >
                    {formatMoney(amountToCents(parseFloat(amount) || 0))}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    to <strong>{recipient?.name || recipient?.maskedMobile}</strong>
                  </Typography>
                </Box>
                <TextField
                  fullWidth
                  label="MPIN"
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  required
                  inputProps={{ maxLength: 6, inputMode: "numeric" }}
                  placeholder="Enter MPIN"
                  sx={{ mb: 3 }}
                />
                <Box sx={{ display: "flex", flexDirection: { xs: "column-reverse", sm: "row" }, gap: 1.5 }}>
                  <Button variant="outlined" onClick={() => setStep(1)} sx={{ borderRadius: 2, minHeight: 48 }}>
                    Back
                  </Button>
                  <Button fullWidth type="submit" variant="contained" size="large" disabled={loading} sx={{ borderRadius: 2, minHeight: 48 }}>
                    {loading ? "Sending..." : "Send"}
                  </Button>
                </Box>
              </Box>
            </Fade>
          )}
        </CardContent>
      </Card>

      <SuccessDialog
        open={!!receipt}
        onClose={() => setReceipt(null)}
        title="Money Sent!"
        subtitle={`Sent to ${receipt?.recipientLabel ?? ""}`}
        amountCents={receipt?.tx.amount.cents ?? 0}
        signPrefix="−"
        rows={[
          { label: "Recipient", value: receipt?.recipientLabel ?? "—" },
          { label: "Date", value: receipt ? formatDate(receipt.tx.createdAt) : "—" },
          ...(receipt?.note ? [{ label: "Note", value: receipt.note }] : []),
        ]}
        reference={receipt?.tx.reference}
        primaryLabel="Done"
        onPrimary={() => {
          setReceipt(null);
          navigate("/");
        }}
        secondaryLabel="Send again"
        onSecondary={() => setReceipt(null)}
      />
    </Box>
  );
}
