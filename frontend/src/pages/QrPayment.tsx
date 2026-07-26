import { useState } from "react";
import { Box, Typography, TextField, Button, Alert, Card, CardContent } from "@mui/material";
import QrCodeIcon from "@mui/icons-material/QrCode";
import { useMutation, useQuery, gql } from "@apollo/client";

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

export default function QrPayment() {
  const [activeTab, setActiveTab] = useState<"my-qr" | "scan">("my-qr");
  const [scanPayload, setScanPayload] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const { data: qrData } = useQuery(MY_QR_CODE);
  const [scanQrPayment, { loading }] = useMutation(SCAN_QR_PAYMENT);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (!scanPayload.trim()) {
      setError("Enter a QR payload");
      return;
    }

    try {
      await scanQrPayment({
        variables: {
          payload: scanPayload,
          idempotencyKey: crypto.randomUUID(),
          pin: pin || undefined,
        },
      });
      setSuccess(true);
      setScanPayload("");
      setPin("");
    } catch (err: any) {
      setError(err.message || "QR payment failed");
    }
  };

  return (
    <Box sx={{ maxWidth: 520, mx: "auto" }}>
      <Typography variant="h5" fontWeight="bold" mb={3}>QR Payment</Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>QR payment successful!</Alert>}

      <Box sx={{ display: "flex", gap: 1, mb: 3 }}>
        <Button
          variant={activeTab === "my-qr" ? "contained" : "outlined"}
          onClick={() => setActiveTab("my-qr")}
        >
          My QR Code
        </Button>
        <Button
          variant={activeTab === "scan" ? "contained" : "outlined"}
          startIcon={<QrCodeIcon />}
          onClick={() => setActiveTab("scan")}
        >
          Scan QR
        </Button>
      </Box>

      {activeTab === "my-qr" && (
        <Card>
          <CardContent sx={{ textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary" mb={2}>
              Show this QR code to scan and pay
            </Typography>
            {qrData?.myQrCode ? (
              <Box sx={{ my: 2 }}>
                <img
                  src={`https://chart.googleapis.com/chart?cht=qr&chs=250x250&chl=${encodeURIComponent(qrData.myQrCode.payload)}`}
                  alt="My QR Code"
                  style={{ width: 250, height: 250 }}
                />
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                  Payload: {qrData.myQrCode.payload}
                </Typography>
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">Loading QR code...</Typography>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "scan" && (
        <Card>
          <CardContent>
            <Box component="form" onSubmit={handleScan}>
              <TextField
                fullWidth
                label="QR Payload (JSON: {to, amount})"
                value={scanPayload}
                onChange={(e) => setScanPayload(e.target.value)}
                required
                multiline
                rows={3}
                sx={{ mb: 2 }}
                placeholder='{"to":"09181234567","amount":500}'
              />
              <TextField
                fullWidth
                label="MPIN (optional)"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                type="password"
                inputProps={{ maxLength: 6 }}
                sx={{ mb: 3 }}
              />
              <Button fullWidth type="submit" variant="contained" size="large" disabled={loading}>
                {loading ? "Processing..." : "Pay"}
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}