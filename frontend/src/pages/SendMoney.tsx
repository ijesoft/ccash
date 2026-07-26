import { useState } from "react";
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
import { useMutation, useQuery, gql } from "@apollo/client";
import { SEND_MONEY } from "../graphql/mutations/transactions";
import { GET_FAVORITES } from "../graphql/queries/wallet";
import { amountToCents, formatMoney } from "../utils/format";
import type { Favorite } from "../types";

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
  const [step, setStep] = useState(0);
  const [mobile, setMobile] = useState("");
  const [recipient, setRecipient] = useState<{ walletId: string; name: string; maskedMobile: string } | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");
  const { data: favsData } = useQuery<{ favorites: Favorite[] }>(GET_FAVORITES);

  const [resolveRecipient] = useMutation(RESOLVE_RECIPIENT);
  const [sendMoneyMut, { loading }] = useMutation(SEND_MONEY);

  const handleResolveMobile = async () => {
    setError("");
    if (!mobile || mobile.length < 10) {
      setError("Enter a valid mobile number");
      return;
    }
    try {
      const { data } = await resolveRecipient({ variables: { mobile } });
      if (data?.resolveRecipient) {
        setRecipient(data.resolveRecipient);
        setStep(1);
      } else {
        setError("No account found for that number");
      }
    } catch (err: any) {
      setError(err.message || "Failed to look up recipient");
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setReference("");

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError("Enter a valid amount");
      return;
    }
    if (!pin || pin.length < 4) {
      setError("Enter your MPIN");
      return;
    }

    try {
      const { data } = await sendMoneyMut({
        variables: {
          input: {
            receiverMobile: mobile,
            amountCents: amountToCents(amountNum),
            idempotencyKey: crypto.randomUUID(),
            description: note || undefined,
            pin: pin,
          },
        },
      });
      const ref = data?.sendMoney?.reference ?? "";
      setReference(ref);
      setStep(0);
      setMobile("");
      setRecipient(null);
      setAmount("");
      setNote("");
      setPin("");
    } catch (err: any) {
      setError(err.message || "Transfer failed");
    }
  };

  const handleSelectFavorite = (fav: Favorite) => {
    setMobile(fav.accountIdentifier);
    setRecipient(null);
  };

  return (
    <Box sx={{ maxWidth: 520, mx: "auto" }}>
      <Typography variant="h5" fontWeight={700} mb={1} gutterBottom sx={{ fontFamily: '"League Spartan", sans-serif' }}>
        Send Money
      </Typography>

      <Stepper activeStep={step} sx={{ mb: 3 }}>
        {STEPS.map((label) => (
          <Step key={label}>
            <StepLabel sx={{ "& .MuiStepLabel-label": { fontWeight: 500 } }}>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}
      {reference && (
        <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>
          Money sent! Ref: <strong>{reference}</strong>
        </Alert>
      )}

      <Card sx={{ borderRadius: 3 }}>
        <CardContent>
          {step === 0 && (
            <Fade in timeout={300}>
              <Box component="form" onSubmit={(e) => { e.preventDefault(); handleResolveMobile(); }}>
                {favsData?.favorites && favsData.favorites.length > 0 && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" color="text.secondary" display="block" mb={1}>Saved recipients</Typography>
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                      {favsData.favorites.map((fav) => (
                        <Chip
                          key={fav.id}
                          label={`${fav.name} (${fav.accountIdentifier})`}
                          onClick={() => handleSelectFavorite(fav)}
                          sx={{ cursor: "pointer" }}
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
                  onChange={(e) => setMobile(e.target.value)}
                  required
                  inputProps={{ maxLength: 11 }}
                  placeholder="09181234567"
                  sx={{ mb: 3 }}
                />
                <Button fullWidth type="submit" variant="contained" size="large" sx={{ borderRadius: 2 }}>
                  Continue
                </Button>
              </Box>
            </Fade>
          )}

          {step === 1 && recipient && (
            <Fade in timeout={300}>
              <Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3, p: 2, bgcolor: "background.muted", borderRadius: 2 }}>
                  <Avatar sx={{ bgcolor: "primary.main", width: 48, height: 48 }}>
                    {recipient.name.charAt(0) || "?"}
                  </Avatar>
                  <Box>
                    <Typography variant="subtitle1" fontWeight={600}>
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
                  inputProps={{ min: 1, step: 0.01 }}
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
                <Box sx={{ display: "flex", gap: 2 }}>
                  <Button variant="outlined" onClick={() => setStep(0)} sx={{ borderRadius: 2 }}>
                    Back
                  </Button>
                  <Button fullWidth variant="contained" onClick={() => setStep(2)} sx={{ borderRadius: 2 }}>
                    Continue
                  </Button>
                </Box>
              </Box>
            </Fade>
          )}

          {step === 2 && (
            <Fade in timeout={300}>
              <Box component="form" onSubmit={handleSend}>
                <Box sx={{ p: 2, bgcolor: "background.muted", borderRadius: 2, mb: 3, textAlign: "center" }}>
                  <Typography variant="caption" color="text.secondary" display="block">You are sending</Typography>
                  <Typography variant="h4" fontWeight={700} color="primary.main">
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
                  inputProps={{ maxLength: 6 }}
                  placeholder="Enter MPIN"
                  sx={{ mb: 3 }}
                />
                <Box sx={{ display: "flex", gap: 2 }}>
                  <Button variant="outlined" onClick={() => setStep(1)} sx={{ borderRadius: 2 }}>
                    Back
                  </Button>
                  <Button fullWidth type="submit" variant="contained" size="large" disabled={loading} sx={{ borderRadius: 2 }}>
                    {loading ? "Sending..." : "Send"}
                  </Button>
                </Box>
              </Box>
            </Fade>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}