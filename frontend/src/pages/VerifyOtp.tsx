import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Box, Button, Card, CardContent, TextField, Typography, Alert, Tabs, Tab } from "@mui/material";
import { useMutation } from "@apollo/client";
import { VERIFY_OTP, SETUP_VERIFY_TOTP } from "../graphql/mutations/auth";

function qrImageUrl(payload: string, size = 200) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(payload)}`;
}

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
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100dvh",
        px: 2,
        py: 3,
        background: `
          radial-gradient(ellipse 80% 60% at 10% 0%, rgba(15,110,205,0.18), transparent 55%),
          radial-gradient(ellipse 60% 50% at 100% 100%, rgba(0,184,148,0.12), transparent 50%),
          #f5f7fa
        `,
      }}
    >
      <Card
        className="animate-slide-up"
        sx={{ maxWidth: 440, width: "100%", borderRadius: 4, boxShadow: "0 16px 40px rgba(15,110,205,0.12)" }}
      >
        <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
          <Typography
            fontWeight={700}
            color="primary"
            textAlign="center"
            gutterBottom
            sx={{ fontFamily: '"League Spartan", sans-serif', fontSize: { xs: "1.35rem", sm: "1.6rem" } }}
          >
            Verify Your Account
          </Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center" mb={2}>
            Choose how you want to verify your email
          </Typography>

          {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

          <Tabs
            value={tab}
            onChange={(_, v) => { setTab(v); setError(""); }}
            variant="fullWidth"
            sx={{ mb: 3, minHeight: 44, "& .MuiTab-root": { minHeight: 44, fontSize: { xs: "0.75rem", sm: "0.875rem" } } }}
          >
            <Tab label="Email Code" />
            <Tab label="Authenticator" />
          </Tabs>

          {tab === 0 && (
            <Box component="form" onSubmit={handleVerify}>
              <Typography variant="body2" color="text.secondary" textAlign="center" mb={2} sx={{ wordBreak: "break-word" }}>
                Enter the 6-digit code sent to <strong>{email}</strong>
              </Typography>
              <TextField
                fullWidth
                label="Code from Email"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                inputProps={{ maxLength: 6, inputMode: "numeric" }}
                sx={{ mb: 3 }}
              />
              <Button fullWidth type="submit" variant="contained" size="large" disabled={loading} sx={{ minHeight: 48 }}>
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
                  <Button fullWidth variant="contained" size="large" onClick={handleSetupTotp} disabled={setupLoading} sx={{ mb: 2, minHeight: 48 }}>
                    {setupLoading ? "Setting up..." : "Show QR Code"}
                  </Button>
                </>
              ) : (
                <>
                  <Box textAlign="center" mb={2}>
                    <Box
                      component="img"
                      src={qrImageUrl(totpSetup.setupVerifyTotp.uri, 200)}
                      alt="QR Code"
                      sx={{ width: { xs: 180, sm: 200 }, height: { xs: 180, sm: 200 }, maxWidth: "100%" }}
                    />
                  </Box>
                  <Typography variant="body2" color="text.secondary" textAlign="center" mb={1}>
                    Or enter this key manually:
                  </Typography>
                  <TextField
                    fullWidth
                    value={totpSetup.setupVerifyTotp.secret}
                    slotProps={{ input: { readOnly: true } }}
                    sx={{ mb: 2, "& input": { textAlign: "center", fontFamily: "monospace", fontSize: { xs: "0.9rem", sm: "1.1rem" }, letterSpacing: 2 } }}
                  />
                  <Box component="form" onSubmit={handleVerify}>
                    <TextField
                      fullWidth
                      label="6-digit code from app"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      required
                      inputProps={{ maxLength: 6, inputMode: "numeric" }}
                      sx={{ mb: 3 }}
                    />
                    <Button fullWidth type="submit" variant="contained" size="large" disabled={loading} sx={{ minHeight: 48 }}>
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
