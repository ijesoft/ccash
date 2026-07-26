import { useState } from "react";
import { useNavigate, Link as RouterLink } from "react-router-dom";
import { Box, Button, Card, CardContent, TextField, Typography, Alert, Link } from "@mui/material";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import { useMutation } from "@apollo/client";
import { useAuth } from "../context/AuthContext";
import { SEND_LOGIN_OTP } from "../graphql/mutations/auth";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const { login } = useAuth();
  const [sendLoginOtp] = useMutation(SEND_LOGIN_OTP);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password, otpCode || undefined);
      navigate("/");
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
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
          <Box sx={{ textAlign: "center", mb: 3 }}>
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: 2.5,
                background: "linear-gradient(135deg, #0f6ecd 0%, #084585 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                mx: "auto",
                mb: 1.5,
                boxShadow: "0 8px 20px rgba(15,110,205,0.35)",
              }}
            >
              <AccountBalanceWalletIcon sx={{ fontSize: 30, color: "white" }} />
            </Box>
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
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
