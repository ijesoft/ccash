import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Box, Button, Card, CardContent, TextField, Typography, Alert } from "@mui/material";
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
    <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", bgcolor: "#f5f5f5" }}>
      <Card sx={{ maxWidth: 400, width: "100%", mx: 2 }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h4" fontWeight="bold" color="primary" textAlign="center" gutterBottom>CCash</Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center" mb={3}>Sign in to your account</Typography>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {otpSent && <Alert severity="success" sx={{ mb: 2 }}>Verification code sent to your email</Alert>}

          <Box component="form" onSubmit={handleSubmit}>
            <TextField fullWidth label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required sx={{ mb: 2 }} />
            <TextField fullWidth label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required sx={{ mb: 2 }} />
            <TextField fullWidth label="2FA / OTP Code" value={otpCode} onChange={(e) => setOtpCode(e.target.value)} placeholder="6-digit code" sx={{ mb: 2 }} />
            <Button fullWidth type="submit" variant="contained" size="large" disabled={loading} sx={{ mb: 1 }}>
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </Box>

          <Button fullWidth variant="outlined" size="small" disabled={sendingOtp} onClick={handleSendOtp}>
            {sendingOtp ? "Sending..." : "Send code to email"}
          </Button>

          <Typography textAlign="center" mt={2}>
            <Link to="/register" style={{ color: "#0f6ecd" }}>Don't have an account? Sign up</Link>
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}