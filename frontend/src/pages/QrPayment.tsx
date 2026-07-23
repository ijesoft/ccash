import { useState } from "react";
import { Box, Typography, Button, TextField, Alert, Tab, Tabs } from "@mui/material";
import { useMutation } from "@apollo/client";
import { gql } from "@apollo/client";
import { amountToCents } from "../utils/format";

const SCAN_QR = gql`
  mutation ScanQrPayment($data: String!) {
    scanQrPayment(data: $data)
  }
`;

export default function QrPayment() {
  const [tab, setTab] = useState(0);
  const [qrData, setQrData] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [scanQr, { loading }] = useMutation(SCAN_QR);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (!qrData) {
      setError("QR data is required");
      return;
    }

    try {
      await scanQr({ variables: { data: qrData } });
      setSuccess(true);
      setQrData("");
    } catch (err: any) {
      setError(err.message || "Payment failed");
    }
  };

  return (
    <Box sx={{ maxWidth: 500, mx: "auto" }}>
      <Typography variant="h5" fontWeight="bold" mb={3}>QR Payment</Typography>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab label="Pay by QR" />
        <Tab label="My QR Code" />
      </Tabs>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>Payment successful!</Alert>}

      {tab === 0 && (
        <Box component="form" onSubmit={handleScan}>
          <TextField fullWidth label="QR Data" value={qrData} onChange={(e) => setQrData(e.target.value)} required sx={{ mb: 3 }} multiline rows={3} placeholder="Paste scanned QR data here" />
          <Button fullWidth type="submit" variant="contained" size="large" disabled={loading}>
            {loading ? "Processing..." : "Pay"}
          </Button>
        </Box>
      )}

      {tab === 1 && (
        <Box sx={{ textAlign: "center", py: 4 }}>
          <Typography variant="body1" mb={2}>Your QR Code</Typography>
          <Box sx={{ width: 200, height: 200, mx: "auto", bgcolor: "#eee", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 2 }}>
            <Typography color="text.secondary">QR Placeholder</Typography>
          </Box>
          <Typography variant="caption" color="text.secondary" mt={2}>
            Share this code to receive payments
          </Typography>
        </Box>
      )}
    </Box>
  );
}