import { useState } from "react";
import { useNavigate, Link as RouterLink } from "react-router-dom";
import { Box, Button, Card, CardContent, TextField, Typography, Alert, Link } from "@mui/material";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import BadgeIcon from "@mui/icons-material/Badge";
import { useMutation } from "@apollo/client";
import { useAuth } from "../context/AuthContext";
import { SEND_LOGIN_OTP } from "../graphql/mutations/auth";
import BrandMark from "../components/BrandMark";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);

  // Step 2: shown once password (+2FA) has succeeded. hasExistingId tells us
  // whether this is "confirm your ID No." or a first-time "set your ID No."
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [hasExistingId, setHasExistingId] = useState(false);
  const [idNo, setIdNo] = useState("");
  const [idError, setIdError] = useState("");
  const [idLoading, setIdLoading] = useState(false);

  const { login, completeLogin } = useAuth();
  const [sendLoginOtp] = useMutation(SEND_LOGIN_OTP);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const challenge = await login(email, password, otpCode || undefined);
      setPendingEmail(challenge.email);
      setHasExistingId(challenge.hasExistingId);
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleIdSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingEmail) return;
    setIdError("");
    setIdLoading(true);
    try {
      await completeLogin(pendingEmail, idNo);
      navigate("/");
    } catch (err: any) {
      setIdError(err.message || "Could not verify ID No.");
    } finally {
      setIdLoading(false);
    }
  };

  const handleBackToCredentials = () => {
    setPendingEmail(null);
    setIdNo("");
    setIdError("");
  };

  const handleSendOtp = async () => {
    if (!email) {
      setError("Enter your email first");
      return;
    }
    setSendingOtp(true);
    setError("");
    try {
      await sendLoginOtp({ variables: { email } });
      setOtpSent(true);
    } catch (err: any) {
      setError(err.message || "Failed to send code");
    } finally {
      setSendingOtp(false);
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
        sx={{ maxWidth: 420, width: "100%", borderRadius: 4, boxShadow: "0 16px 40px rgba(15,110,205,0.12)" }}
      >
        <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
          {!pendingEmail ? (
            <>
              <Box sx={{ textAlign: "center", mb: 3 }}>
                <BrandMark icon={<AccountBalanceWalletIcon sx={{ fontSize: 30, color: "white" }} />} />
                <Typography
                  fontWeight={700}
                  sx={{ fontFamily: '"League Spartan", sans-serif', color: "primary.main", fontSize: { xs: "1.75rem", sm: "2rem" }, letterSpacing: "-0.03em" }}
                >
                  CCash
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Sign in to your wallet
                </Typography>
              </Box>

              {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}
              {otpSent && <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>Verification code sent to your email</Alert>}

              <Box component="form" onSubmit={handleSubmit}>
                <TextField
                  fullWidth
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  margin="normal"
                  autoComplete="email"
                />
                <TextField
                  fullWidth
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  margin="normal"
                  autoComplete="current-password"
                />
                <TextField
                  fullWidth
                  label="2FA / OTP Code (optional)"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="6-digit code"
                  margin="normal"
                  inputProps={{ maxLength: 6, inputMode: "numeric" }}
                />
                <Button
                  fullWidth
                  type="submit"
                  variant="contained"
                  size="large"
                  disabled={loading}
                  sx={{ mt: 2, mb: 1, borderRadius: 2, py: 1.5, minHeight: 48 }}
                >
                  {loading ? "Signing in..." : "Sign In"}
                </Button>
              </Box>

              <Button
                fullWidth
                variant="outlined"
                size="small"
                disabled={sendingOtp}
                onClick={handleSendOtp}
                sx={{ borderRadius: 2, minHeight: 40 }}
              >
                {sendingOtp ? "Sending..." : "Send code to email"}
              </Button>

              <Box sx={{ textAlign: "center", mt: 3 }}>
                <Link component={RouterLink} to="/register" underline="hover" fontWeight={500}>
                  Don&apos;t have an account? Sign up
                </Link>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  <Link component={RouterLink} to="/register-merchant" underline="hover" fontWeight={500}>
                    Sign up as a Merchant
                  </Link>
                </Typography>
              </Box>
            </>
          ) : (
            <>
              <Box sx={{ textAlign: "center", mb: 3 }}>
                <BrandMark icon={<BadgeIcon sx={{ fontSize: 30, color: "white" }} />} />
                <Typography
                  fontWeight={700}
                  sx={{ fontFamily: '"League Spartan", sans-serif', color: "primary.main", fontSize: { xs: "1.75rem", sm: "2rem" }, letterSpacing: "-0.03em" }}
                >
                  CCash
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {hasExistingId ? "Confirm your ID No. to continue" : "Set your ID No. to finish signing in"}
                </Typography>
              </Box>

              {idError && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{idError}</Alert>}
              {!hasExistingId && (
                <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
                  Your account doesn&apos;t have an ID No. on file yet. Choose one now — you&apos;ll need
                  the same one every time you sign in.
                </Alert>
              )}

              <Box component="form" onSubmit={handleIdSubmit}>
                <TextField
                  fullWidth
                  label="ID No."
                  value={idNo}
                  onChange={(e) => {
                    setIdNo(e.target.value.replace(/\D/g, "").slice(0, 9));
                    if (idError) setIdError("");
                  }}
                  required
                  margin="normal"
                  autoFocus
                  placeholder="123456789"
                  helperText={hasExistingId ? "Your 9-digit Member/Merchant ID" : "Choose a 9-digit ID No. you'll remember"}
                  inputProps={{ inputMode: "numeric", pattern: "[0-9]*", maxLength: 9 }}
                />
                <Button
                  fullWidth
                  type="submit"
                  variant="contained"
                  size="large"
                  disabled={idLoading || idNo.length !== 9}
                  sx={{ mt: 2, mb: 1, borderRadius: 2, py: 1.5, minHeight: 48 }}
                >
                  {idLoading ? "Verifying..." : hasExistingId ? "Continue" : "Set ID & Continue"}
                </Button>
                <Button
                  fullWidth
                  variant="text"
                  size="small"
                  onClick={handleBackToCredentials}
                  sx={{ borderRadius: 2, minHeight: 40 }}
                >
                  Back
                </Button>
              </Box>
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
