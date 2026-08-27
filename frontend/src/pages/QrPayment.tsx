import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  Card,
  CardContent,
  ToggleButton,
  ToggleButtonGroup,
  Divider,
  Stack,
  Chip,
  Avatar,
} from "@mui/material";
import QrCodeIcon from "@mui/icons-material/QrCode";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import VerifiedUserIcon from "@mui/icons-material/VerifiedUser";
import { useMutation, useQuery, useLazyQuery, gql } from "@apollo/client";
import QRCode from "qrcode";
import { GET_WALLET, GET_TRANSACTIONS } from "../graphql/queries/wallet";
import { SCAN_QR_PAYMENT } from "../graphql/mutations/transactions";
import { amountToCents, cleanPhilippineMobile, formatDate } from "../utils/format";
import SuccessDialog from "../components/SuccessDialog";
import QrCameraScanner from "../components/QrCameraScanner";
import { useAuth } from "../context/AuthContext";
import type { Transaction } from "../types";

const MY_QR_CODE = gql`
  query MyQrCode {
    myQrCode {
      payload
    }
  }
`;

const RESOLVE_RECIPIENT = gql`
  query ResolveRecipient($mobile: String!) {
    resolveRecipient(mobile: $mobile) {
      walletId
      name
      maskedMobile
    }
  }
`;

const QUICK_AMOUNTS = [50, 100, 200, 500, 1000];

export default function QrPayment() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"my-qr" | "scan">("my-qr");
  const [scanPayload, setScanPayload] = useState("");
  const [amount, setAmount] = useState("");
  const [isDynamicAmount, setIsDynamicAmount] = useState(false);
  const [note, setNote] = useState("");
  const [pin, setPin] = useState("");
  const [recipientInfo, setRecipientInfo] = useState<{ name: string; target: string } | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [receipt, setReceipt] = useState<Transaction | null>(null);
  const [scannedHint, setScannedHint] = useState("");
  const [qrImageUrl, setQrImageUrl] = useState("");

  const { data: qrData } = useQuery(MY_QR_CODE);
  const [resolveRecipient] = useLazyQuery(RESOLVE_RECIPIENT);

  useEffect(() => {
    if (qrData?.myQrCode?.payload) {
      QRCode.toDataURL(qrData.myQrCode.payload, {
        width: 280,
        margin: 2,
        color: {
          dark: "#1e293b",
          light: "#ffffff",
        },
      })
        .then(setQrImageUrl)
        .catch(() => setQrImageUrl(""));
    }
  }, [qrData]);

  const [scanQrPaymentMut, { loading }] = useMutation(SCAN_QR_PAYMENT, {
    refetchQueries: [{ query: GET_WALLET }, { query: GET_TRANSACTIONS, variables: { limit: 5, offset: 0 } }],
  });

  const parseAndInspectPayload = async (rawPayload: string) => {
    const raw = rawPayload.trim();
    if (!raw) {
      setRecipientInfo(null);
      setIsDynamicAmount(false);
      return;
    }

    let to = "";
    let parsedAmount = 0;
    let parsedNote = "";
    let displayName = "";

    try {
      const data = JSON.parse(raw);
      if (typeof data === "object" && data !== null) {
        to = data.to || data.receiver || data.wallet_id || data.mobile || "";
        displayName = data.name || "";
        if (typeof data.amount === "number" && data.amount > 0) {
          parsedAmount = data.amount;
        }
        parsedNote = data.description || data.note || "";
      }
    } catch {
      to = raw;
    }

    if (parsedAmount > 0) {
      setAmount(String(parsedAmount));
      setIsDynamicAmount(true);
    } else {
      setIsDynamicAmount(false);
    }

    if (parsedNote) {
      setNote(parsedNote);
    }

    const cleanedMobile = cleanPhilippineMobile(to);
    if (cleanedMobile && cleanedMobile.length >= 10) {
      try {
        const { data } = await resolveRecipient({ variables: { mobile: cleanedMobile } });
        if (data?.resolveRecipient) {
          setRecipientInfo({
            name: data.resolveRecipient.name || displayName || "CCash User",
            target: data.resolveRecipient.maskedMobile || cleanedMobile,
          });
          return;
        }
      } catch {
        // fallback
      }
    }

    if (to) {
      setRecipientInfo({
        name: displayName || "Merchant / User",
        target: to.length > 20 ? `${to.slice(0, 8)}...${to.slice(-6)}` : to,
      });
    } else {
      setRecipientInfo(null);
    }
  };

  const handlePayloadChange = (val: string) => {
    setScanPayload(val);
    setError("");
    void parseAndInspectPayload(val);
  };

  const handleCameraScan = (payload: string) => {
    setScanPayload(payload);
    setScannedHint("QR code detected! Please verify amount and enter MPIN.");
    setError("");
    void parseAndInspectPayload(payload);
  };

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!scanPayload.trim()) {
      setError("Please scan or paste a QR code payload");
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError("Please enter a valid amount to pay");
      return;
    }

    if (!pin || pin.length < 4) {
      setError("Please enter your MPIN");
      return;
    }

    try {
      const { data } = await scanQrPaymentMut({
        variables: {
          payload: scanPayload.trim(),
          idempotencyKey: crypto.randomUUID(),
          amountCents: amountToCents(amountNum),
          pin: pin,
          description: note || undefined,
        },
      });

      if (data?.scanQrPayment) {
        setReceipt(data.scanQrPayment);
      }
      setScanPayload("");
      setAmount("");
      setNote("");
      setPin("");
      setRecipientInfo(null);
    } catch (err: any) {
      setError(err.message || "QR payment failed");
    }
  };

  const handleCopyQr = async () => {
    if (!qrData?.myQrCode?.payload) return;
    try {
      await navigator.clipboard.writeText(qrData.myQrCode.payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const myDisplayName = user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email.split("@")[0] : "My Account";

  return (
    <Box sx={{ maxWidth: 520, mx: "auto" }} className="animate-fade-in">
      <Typography
        fontWeight={700}
        mb={2.5}
        sx={{ fontFamily: '"League Spartan", sans-serif', fontSize: { xs: "1.35rem", sm: "1.5rem" } }}
      >
        QR Payment (QR Ph)
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}
      {scannedHint && <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>{scannedHint}</Alert>}

      <ToggleButtonGroup
        exclusive
        fullWidth
        value={activeTab}
        onChange={(_, v) => {
          if (!v) return;
          setActiveTab(v);
          setError("");
          setScannedHint("");
        }}
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
        <ToggleButton value="my-qr">Receive via QR</ToggleButton>
        <ToggleButton value="scan">
          <QrCodeIcon sx={{ mr: 1, fontSize: 18 }} />
          Scan to Pay
        </ToggleButton>
      </ToggleButtonGroup>

      {activeTab === "my-qr" && (
        <Card sx={{ borderRadius: 3, border: "1px solid", borderColor: "divider", boxShadow: "0 4px 20px rgba(0,0,0,0.06)" }}>
          <CardContent sx={{ textAlign: "center", p: { xs: 2.5, sm: 3.5 } }}>
            <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, bgcolor: "primary.50", color: "primary.main", px: 1.5, py: 0.5, borderRadius: 2, mb: 2 }}>
              <VerifiedUserIcon sx={{ fontSize: 16 }} />
              <Typography variant="caption" fontWeight={700} letterSpacing={0.5}>
                QR Ph Standard Interoperable
              </Typography>
            </Box>

            <Typography variant="h6" fontWeight={700}>
              {myDisplayName}
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={2.5}>
              {user?.phone ? user.phone : "Scan with CCash, GCash, Maya, or any QR Ph app"}
            </Typography>

            {qrImageUrl ? (
              <Box sx={{ my: 1 }}>
                <Box
                  component="img"
                  src={qrImageUrl}
                  alt="My QR Code"
                  sx={{
                    width: { xs: "min(240px, 75vw)", sm: 260 },
                    height: "auto",
                    maxWidth: "100%",
                    borderRadius: 3,
                    border: "2px solid",
                    borderColor: "grey.200",
                    p: 1.5,
                    bgcolor: "white",
                  }}
                />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  display="block"
                  sx={{
                    mt: 2,
                    px: 1,
                    wordBreak: "break-all",
                    fontFamily: "monospace",
                    fontSize: "0.7rem",
                    bgcolor: "grey.50",
                    py: 1,
                    borderRadius: 1.5,
                  }}
                >
                  {qrData?.myQrCode?.payload}
                </Typography>
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">Loading QR code...</Typography>
            )}

            <Button
              variant="outlined"
              startIcon={copied ? <CheckIcon color="success" /> : <ContentCopyIcon />}
              onClick={handleCopyQr}
              sx={{ mt: 2, borderRadius: 2, minHeight: 42 }}
            >
              {copied ? "Copied QR Details" : "Copy QR Details"}
            </Button>
          </CardContent>
        </Card>
      )}

      {activeTab === "scan" && (
        <Card sx={{ borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
          <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
            <QrCameraScanner active={activeTab === "scan"} onScan={handleCameraScan} />

            <Divider sx={{ my: 2.5 }}>
              <Typography variant="caption" color="text.secondary">
                or enter QR payload / mobile number
              </Typography>
            </Divider>

            <Box component="form" onSubmit={handlePay}>
              <TextField
                fullWidth
                label="QR Payload or Recipient Mobile"
                value={scanPayload}
                onChange={(e) => handlePayloadChange(e.target.value)}
                required
                multiline
                rows={2}
                sx={{ mb: 2 }}
                placeholder='09181234567 or {"to":"09181234567","amount":500}'
                helperText="Use camera above, paste QR JSON, or enter standard Philippine mobile"
              />

              {recipientInfo && (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    p: 1.5,
                    bgcolor: "grey.50",
                    borderRadius: 2,
                    border: "1px solid",
                    borderColor: "grey.200",
                    mb: 2,
                  }}
                >
                  <Avatar sx={{ bgcolor: "primary.main", width: 40, height: 40, fontWeight: 700 }}>
                    {recipientInfo.name.charAt(0) || "?"}
                  </Avatar>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="subtitle2" fontWeight={700} noWrap>
                      {recipientInfo.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap display="block">
                      {recipientInfo.target}
                    </Typography>
                  </Box>
                  <Chip label="Verified" size="small" color="success" variant="outlined" />
                </Box>
              )}

              <TextField
                fullWidth
                label="Amount (PHP)"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                disabled={isDynamicAmount}
                sx={{ mb: 1.5 }}
                inputProps={{ min: 1, step: 0.01, inputMode: "decimal" }}
                helperText={isDynamicAmount ? "Amount is pre-set by the merchant/sender QR code" : undefined}
              />

              {!isDynamicAmount && (
                <Stack direction="row" spacing={1} sx={{ mb: 2.5, flexWrap: "wrap", gap: 1 }}>
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
              )}

              <TextField
                fullWidth
                label="Note / Message (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                sx={{ mb: 2 }}
                placeholder="Payment for..."
              />

              <TextField
                fullWidth
                label="MPIN"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                required
                type="password"
                inputProps={{ maxLength: 6, inputMode: "numeric" }}
                placeholder="Enter 4 or 6-digit MPIN"
                sx={{ mb: 3 }}
              />

              <Button fullWidth type="submit" variant="contained" size="large" disabled={loading} sx={{ minHeight: 48, borderRadius: 2 }}>
                {loading ? "Processing Payment..." : `Pay ${amount ? `₱${parseFloat(amount || "0").toLocaleString(undefined, { minimumFractionDigits: 2 })}` : ""}`}
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

      <SuccessDialog
        open={!!receipt}
        onClose={() => setReceipt(null)}
        title="Payment Successful"
        subtitle="QR Ph payment processed successfully"
        amountCents={receipt?.amount.cents ?? 0}
        signPrefix="−"
        rows={[
          { label: "Type", value: "QR Ph Payment" },
          { label: "Date", value: receipt ? formatDate(receipt.createdAt) : "—" },
          {
            label: "Paid to",
            value: receipt?.counterparty?.name || receipt?.counterparty?.maskedMobile || "Recipient",
          },
          ...(receipt?.description ? [{ label: "Note", value: receipt.description }] : []),
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

