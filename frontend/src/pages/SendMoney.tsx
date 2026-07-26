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

const STEPS = ["Enter mobile", "Confirm recipient", "Amount & note", "MPIN & send"];

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

  const handleConfirmRecipient = () => {
    setError("");
    setStep(2);
  };

  const handleStep3Next = () => {
    setError("");
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError("Enter a valid amount");
      return;
    }
    setStep(3);
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
      setReference(data?.sendMoney?.reference ?? "");
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

  const resetForm = () => {
    setStep(0);
    setMobile("");
    setRecipient(null);
    setAmount("");
    setNote("");
    setPin("");
    setError("");
    setReference("");
  };

  return (
    <Box sx={{ maxWidth: 520, mx: "auto" }}>
      <Typography variant="h5" fontWeight="bold" mb={3}>Send Money</Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {reference && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Money sent! Reference: <strong>{reference}</strong>
        </Alert>
      )}

      <Stepper activeStep={step} sx={{ mb: 4 }}>
        {STEPS.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      <Card>
        <CardContent>
          {step === 0 && (
            <Box component="form" onSubmit={(e) => { e.preventDefault(); handleResolveMobile(); }}>
              {favsData?.favorites && favsData.favorites.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="caption" color="text.secondary">Saved recipients</Typography>
                  {favsData.favorites.map((fav) => (
                    <Chip
                      key={fav.id}
                      label={`${fav.name} (${fav.accountIdentifier})`}
                      onClick={() => handleSelectFavorite(fav)}
                      sx={{ mr: 1, mb: 1, cursor: "pointer" }}
                      variant="outlined"
                      size="small"
                    />
                  ))}
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
              <Button fullWidth type="submit" variant="contained" size="large">
                Continue
              </Button>
            </Box>
          )}

          {step === 1 && recipient && (
            <Box>
              <Typography variant="body2" color="text.secondary" mb={2}>
                Confirm the recipient
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}>
                <Avatar sx={{ bgcolor: "primary.main" }}>
                  {recipient.name.charAt(0) || "?"}
                </Avatar>
                <Box>
                  <Typography variant="subtitle1" fontWeight="bold">
                    {recipient.name || "Recipient"}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {recipient.maskedMobile}
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ display: "flex", gap: 2 }}>
                <Button variant="outlined" onClick={resetForm}>
                  Change
                </Button>
                <Button fullWidth variant="contained" onClick={handleConfirmRecipient}>
                  Continue
                </Button>
              </Box>
            </Box>
          )}

          {step === 2 && (
            <Box component="form" onSubmit={(e) => { e.preventDefault(); handleStep3Next(); }}>
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
                <Button variant="outlined" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button fullWidth type="submit" variant="contained" size="large">
                  Continue
                </Button>
              </Box>
            </Box>
          )}

          {step === 3 && (
            <Box component="form" onSubmit={handleSend}>
              <Typography variant="body2" color="text.secondary" mb={2}>
                You are sending{" "}
                <strong>{formatMoney(amountToCents(parseFloat(amount) || 0))}</strong>{" "}
                to <strong>{recipient?.name || recipient?.maskedMobile}</strong>
              </Typography>
              <TextField
                fullWidth
                label="MPIN"
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                required
                inputProps={{ maxLength: 6 }}
                placeholder="Enter your MPIN"
                sx={{ mb: 3 }}
              />
              <Box sx={{ display: "flex", gap: 2 }}>
                <Button variant="outlined" onClick={() => setStep(2)}>
                  Back
                </Button>
                <Button fullWidth type="submit" variant="contained" size="large" disabled={loading}>
                  {loading ? "Sending..." : "Send Money"}
                </Button>
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}