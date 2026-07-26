import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Typography, TextField, Button, Alert, Card, CardContent, ToggleButton, ToggleButtonGroup } from "@mui/material";
import QrCodeIcon from "@mui/icons-material/QrCode";
import { useMutation, useQuery, gql } from "@apollo/client";
import { GET_WALLET, GET_TRANSACTIONS } from "../graphql/queries/wallet";
import { formatDate } from "../utils/format";
import SuccessDialog from "../components/SuccessDialog";
import type { Transaction } from "../types";

const MY_QR_CODE = gql`
  query MyQrCode {
    myQrCode {
      payload
    }
  }
`;

const SCAN_QR_PAYMENT = gql`
  mutation ScanQrPayment($payload: String!, $idempotencyKey: String!, $pin: String) {
    scanQrPayment(payload: $payload, idempotencyKey: $idempotencyKey, pin: $pin) {
      id
      type
      status
      direction
      amount { cents }
      reference
      createdAt
    }
  }
`;

function qrImageUrl(payload: string, size = 250) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(payload)}`;
}

export default function QrPayment() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"my-qr" | "scan">("my-qr");
  const [scanPayload, setScanPayload] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<Transaction | null>(null);

  const { data: qrData } = useQuery(MY_QR_CODE);
  const [scanQrPayment, { loading }] = useMutation(SCAN_QR_PAYMENT, {
    refetchQueries: [{ query: GET_WALLET }, { query: GET_TRANSACTIONS, variables: { limit: 5, offset: 0 } }],
  });

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!scanPayload.trim()) {
      setError("Enter a QR payload");
      return;
    }

    try {
      const { data } = await scanQrPayment({
        variables: {
          payload: scanPayload,
          idempotencyKey: crypto.randomUUID(),
          pin: pin || undefined,
        },
      });
      if (data?.scanQrPayment) setReceipt(data.scanQrPayment);
      setScanPayload("");
      setPin("");
    } catch (err: any) {
      setError(err.message || "QR payment failed");
    }
  };

  return (
    <Box sx={{ maxWidth: 520, mx: "auto" }} className="animate-fade-in">
      <Typography
        fontWeight={700}
        mb={2.5}
        sx={{ fontFamily: '"League Spartan", sans-serif', fontSize: { xs: "1.35rem", sm: "1.5rem" } }}
      >
        QR Payment
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

      <ToggleButtonGroup
        exclusive
        fullWidth
        value={activeTab}
        onChange={(_, v) => v && setActiveTab(v)}
        sx={{
          mb: 3,
          "& .MuiToggleButton-root": {
            textTransform: "none",
            fontWeight: 600,
            borderRadius: "12px !important",
            py: 1.25,
            minHeight: 48,
          },
        }}
      >
        <ToggleButton value="my-qr">My QR Code</ToggleButton>
        <ToggleButton value="scan">
          <QrCodeIcon sx={{ mr: 1, fontSize: 18 }} />
          Scan / Pay
        </ToggleButton>
      </ToggleButtonGroup>

      {activeTab === "my-qr" && (
        <Card sx={{ borderRadius: 3 }}>
          <CardContent sx={{ textAlign: "center", p: { xs: 2, sm: 3 } }}>
            <Typography variant="body2" color="text.secondary" mb={2}>
              Show this QR code to receive a payment
            </Typography>
            {qrData?.myQrCode ? (
              <Box sx={{ my: 1 }}>
                <Box
                  component="img"
                  src={qrImageUrl(qrData.myQrCode.payload, 250)}
                  alt="My QR Code"
                  sx={{
                    width: { xs: "min(220px, 70vw)", sm: 250 },
                    height: "auto",
                    maxWidth: "100%",
                    borderRadius: 2,
                    border: "1px solid",
                    borderColor: "divider",
                  }}
                />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  display="block"
                  sx={{
                    mt: 1.5,
                    px: 1,
                    wordBreak: "break-all",
                    fontFamily: "monospace",
                    fontSize: "0.65rem",
                  }}
                >
                  {qrData.myQrCode.payload}
                </Typography>
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">Loading QR code...</Typography>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "scan" && (
        <Card sx={{ borderRadius: 3 }}>
          <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
            <Box component="form" onSubmit={handleScan}>
              <TextField
                fullWidth
                label="QR Payload"
                value={scanPayload}
                onChange={(e) => setScanPayload(e.target.value)}
                required
                multiline
                rows={3}
                sx={{ mb: 2 }}
                placeholder='{"to":"09181234567","amount":500}'
                helperText="Paste the QR payload JSON from the payer"
              />
              <TextField
                fullWidth
                label="MPIN (optional)"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                type="password"
                inputProps={{ maxLength: 6, inputMode: "numeric" }}
                sx={{ mb: 3 }}
              />
              <Button fullWidth type="submit" variant="contained" size="large" disabled={loading} sx={{ minHeight: 48 }}>
                {loading ? "Processing..." : "Pay"}
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

      <SuccessDialog
        open={!!receipt}
        onClose={() => setReceipt(null)}
        title="Payment Successful"
        subtitle="QR payment completed"
        amountCents={receipt?.amount.cents ?? 0}
        signPrefix={receipt?.direction === "IN" ? "+" : "−"}
        rows={[
          { label: "Type", value: "QR Payment" },
          { label: "Date", value: receipt ? formatDate(receipt.createdAt) : "—" },
        ]}
        reference={receipt?.reference ?? receipt?.id}
        primaryLabel="Done"
        onPrimary={() => {
          setReceipt(null);
          navigate("/");
        }}
        secondaryLabel="Make another payment"
        onSecondary={() => setReceipt(null)}
      />
    </Box>
  );
}
