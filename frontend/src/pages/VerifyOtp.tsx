import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Box, Button, Card, CardContent, TextField, Typography, Alert, Tabs, Tab } from "@mui/material";
import { useMutation } from "@apollo/client";
import { VERIFY_OTP, SETUP_VERIFY_TOTP } from "../graphql/mutations/auth";

export default function VerifyOtp() {
  const [tab, setTab] = useState(1);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email") || "";
  const [verifyOtp, { loading }] = useMutation(VERIFY_OTP);
  const [setupTotp, { data: totpSetup, loading: setupLoading }] = useMutation(SETUP_VERIFY_TOTP);
  const navigate = useNavigate();

  useEffect(() => {
    if (email) {
      setupTotp({ variables: { email } }).catch(() => {});
    }
  }, [email, setupTotp]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await verifyOtp({ variables: { email, code } });
      navigate("/login");
    } catch (err: any) {
      setError(err.message || "Verification failed");
    }
  };

  const handleSetupTotp = async () => {
    setError("");
    try {
      await setupTotp({ variables: { email } });
    } catch (err: any) {
      setError(err.message || "Failed to setup authenticator");
    }
  };

  return (
    <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", bgcolor: "#f5f5f5" }}>
      <Card sx={{ maxWidth: 440, width: "100%", mx: 2 }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h4" fontWeight="bold" color="primary" textAlign="center" gutterBottom>Verify Your Account</Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center" mb={3}>
            Choose how you want to verify your email
          </Typography>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <Tabs value={tab} onChange={(_, v) => { setTab(v); setError(""); }} variant="fullWidth" sx={{ mb: 3 }}>
            <Tab label="Email Code" />
            <Tab label="Authenticator App" />
          </Tabs>

          {tab === 0 && (
            <Box component="form" onSubmit={handleVerify}>
              <Typography variant="body2" color="text.secondary" textAlign="center" mb={2}>
                Enter the 6-digit code sent to <strong>{email}</strong>
              </Typography>
              <TextField fullWidth label="Code from Email" value={code} onChange={(e) => setCode(e.target.value)} required inputProps={{ maxLength: 6 }} sx={{ mb: 3 }} />
              <Button fullWidth type="submit" variant="contained" size="large" disabled={loading}>
                {loading ? "Verifying..." : "Verify"}
              </Button>
            </Box>
          )}

          {tab === 1 && (
            <Box>
              {!totpSetup?.setupVerifyTotp ? (
                <>
                  <Typography variant="body2" color="text.secondary" textAlign="center" mb={2}>
                    Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.)
                  </Typography>
                  <Button fullWidth variant="contained" size="large" onClick={handleSetupTotp} disabled={setupLoading} sx={{ mb: 2 }}>
                    {setupLoading ? "Setting up..." : "Show QR Code"}
                  </Button>
                </>
              ) : (
                <>
                  <Box textAlign="center" mb={2}>
                    <img
                      src={`https://chart.googleapis.com/chart?cht=qr&chs=200x200&chl=${encodeURIComponent(totpSetup.setupVerifyTotp.uri)}`}
                      alt="QR Code"
                      style={{ width: 200, height: 200 }}
                    />
                  </Box>
                  <Typography variant="body2" color="text.secondary" textAlign="center" mb={1}>
                    Or enter this key manually:
                  </Typography>
                  <TextField fullWidth value={totpSetup.setupVerifyTotp.secret} slotProps={{ input: { readOnly: true } }} sx={{ mb: 2, "& input": { textAlign: "center", fontFamily: "monospace", fontSize: "1.1rem", letterSpacing: 2 } }} />
                  <Box component="form" onSubmit={handleVerify}>
                    <TextField fullWidth label="6-digit code from app" value={code} onChange={(e) => setCode(e.target.value)} required inputProps={{ maxLength: 6 }} sx={{ mb: 3 }} />
                    <Button fullWidth type="submit" variant="contained" size="large" disabled={loading}>
                      {loading ? "Verifying..." : "Verify"}
                    </Button>
                  </Box>
                </>
              )}
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}