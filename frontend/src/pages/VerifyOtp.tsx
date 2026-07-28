import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Box, Button, Card, CardContent, TextField, Typography, Alert } from "@mui/material";
import { useMutation } from "@apollo/client";
import { VERIFY_OTP } from "../graphql/mutations/auth";
// import { SETUP_VERIFY_TOTP } from "../graphql/mutations/auth";

// TODO(josh): uncomment to re-enable authenticator app verification
// function qrImageUrl(payload: string, size = 200) {
//   return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(payload)}`;
// }

export default function VerifyOtp() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email") || "";
  const [verifyOtp, { loading }] = useMutation(VERIFY_OTP);
  const navigate = useNavigate();

  // TODO(josh): uncomment to re-enable authenticator app verification
  // const [setupTotp, { data: totpSetup, loading: setupLoading }] = useMutation(SETUP_VERIFY_TOTP);
  //
  // useEffect(() => {
  //   if (email) {
  //     setupTotp({ variables: { email } }).catch(() => {});
  //   }
  // }, [email, setupTotp]);

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

  // TODO(josh): uncomment to re-enable authenticator app verification
  // const handleSetupTotp = async () => {
  //   setError("");
  //   try {
  //     await setupTotp({ variables: { email } });
  //   } catch (err: any) {
  //     setError(err.message || "Failed to setup authenticator");
  //   }
  // };

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
          {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

          {/* TODO(josh): uncomment Tabs + Authenticator tab to re-enable authenticator app verification */}
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

          {/* Tabs + Authenticator tab content removed for now */}
        </CardContent>
      </Card>
    </Box>
  );
}
