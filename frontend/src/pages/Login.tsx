import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Button, Card, CardContent, TextField, Typography, Alert } from "@mui/material";
import SecurityIcon from "@mui/icons-material/Security";
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
        minHeight: "100vh",
        bgcolor: "background.default",
        px: 2,
      }}
    >
      <Card sx={{ maxWidth: 400, width: "100%", borderRadius: 3, boxShadow: "lg" }}>
        <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
          <Box sx={{ textAlign: "center", mb: 3 }}>
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: 2.5,
                bgcolor: "primary.main",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                mx: "auto",
                mb: 1.5,
              }}
            >
              <SecurityIcon sx={{ fontSize: 30, color: "white" }} />
            </Box>
            <Typography variant="h4" fontWeight={700} sx={{ fontFamily: '"League Spartan", sans-serif', color: "primary.main" }}>
              CCash
            </Typography>
            <Typography variant="body2" color="text.secondary">Sign in to your account</Typography>
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
              sx={{ borderRadius: 2 }}
            />
            <TextField
              fullWidth
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              margin="normal"
              sx={{ borderRadius: 2 }}
            />
            <TextField
              fullWidth
              label="2FA / OTP Code (optional)"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value)}
              placeholder="6-digit code"
              margin="normal"
              inputProps={{ maxLength: 6 }}
              sx={{ borderRadius: 2 }}
            />
            <Button
              fullWidth
              type="submit"
              variant="contained"
              size="large"
              disabled={loading}
              sx={{ mt: 2, mb: 1, borderRadius: 2, py: 1.5 }}
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
            sx={{ borderRadius: 2 }}
          >
            {sendingOtp ? "Sending..." : "Send code to email"}
          </Button>

          <Box sx={{ textAlign: "center", mt: 3 }}>
            <a href="/register" style={{ color: "#0f6ecd", textDecoration: "none", fontWeight: 500 }}>
              Don't have an account? Sign up
            </a>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}