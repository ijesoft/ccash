import { useState } from "react";
import { useNavigate, Link as RouterLink, useSearchParams, useLocation } from "react-router-dom";
import { Box, Button, Card, CardContent, TextField, Typography, Alert, Link, Dialog, DialogTitle, DialogContent, DialogActions } from "@mui/material";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import { useMutation } from "@apollo/client";
import { useAuth } from "../context/AuthContext";
import { SEND_LOGIN_OTP, REQUEST_PASSWORD_RESET, RESET_PASSWORD_WITH_CODE } from "../graphql/mutations/auth";
import BrandMark from "../components/BrandMark";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);

  // The ID No. confirmation step is disabled: completeLogin is called with an
  // empty id right after the password (+2FA) challenge succeeds.

  const { login, completeLogin } = useAuth();
  const [sendLoginOtp] = useMutation(SEND_LOGIN_OTP);
  const [requestPasswordReset, { loading: requesting }] = useMutation(REQUEST_PASSWORD_RESET);
  const [resetPasswordWithCode, { loading: resetting }] = useMutation(RESET_PASSWORD_WITH_CODE);
  const [infoOpen, setInfoOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestEmail, setRequestEmail] = useState("");
  const [requestError, setRequestError] = useState("");
  const [requestSuccess, setRequestSuccess] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetCode, setResetCode] = useState("");
  const [resetNew, setResetNew] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetSuccess, setResetSuccess] = useState("");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const sessionExpired = searchParams.get("reason") === "session-expired";
  const justRegisteredEmail = (location.state as { registeredEmail?: string; pendingApproval?: boolean } | null)?.registeredEmail;
  const pendingApproval = (location.state as { pendingApproval?: boolean } | null)?.pendingApproval === true;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const challenge = await login(email, password, otpCode || undefined);
      await completeLogin(challenge.email, "");
      const raw = localStorage.getItem("user");
      const role = raw ? (JSON.parse(raw).role as string) : "";
      navigate(role === "SUPER_ADMIN" ? "/super-admin" : role === "AUDITOR" ? "/auditor" : "/");
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

  const closeInfoDialog = () => {
    setInfoOpen(false);
  };

  const openRequestDialog = () => {
    setRequestEmail("");
    setRequestError("");
    setRequestSuccess("");
    setRequestOpen(true);
  };

  const closeRequestDialog = () => {
    setRequestOpen(false);
    setRequestError("");
    setRequestSuccess("");
    setRequestEmail("");
  };

  const handleProceedToRequest = () => {
    setInfoOpen(false);
    openRequestDialog();
  };

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRequestError("");
    setRequestSuccess("");
    try {
      await requestPasswordReset({ variables: { email: requestEmail } });
      setRequestSuccess("Request recorded — ask an admin for your recovery code");
    } catch (err: any) {
      setRequestError(err.message || "Request failed");
    }
  };

  const openResetDialog = () => {
    setResetCode("");
    setResetNew("");
    setResetConfirm("");
    setResetError("");
    setResetSuccess("");
    setResetOpen(true);
  };

  const closeResetDialog = () => {
    setResetOpen(false);
    setResetError("");
    setResetSuccess("");
    setResetCode("");
    setResetNew("");
    setResetConfirm("");
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError("");
    setResetSuccess("");
    if (resetNew !== resetConfirm) {
      setResetError("Passwords do not match");
      return;
    }
    if (resetNew.length < 8) {
      setResetError("Password must be at least 8 characters");
      return;
    }
    try {
      await resetPasswordWithCode({ variables: { code: resetCode, newPassword: resetNew, confirmPassword: resetConfirm } });
      setResetSuccess("Password changed — please log in.");
      setResetCode("");
      setResetNew("");
      setResetConfirm("");
    } catch (err: any) {
      setResetError(err.message || "Reset failed");
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
            <BrandMark icon={<AccountBalanceWalletIcon sx={{ fontSize: 30, color: "white" }} />} />
            <Typography
              fontWeight={700}
              sx={{ fontFamily: '"League Spartan", sans-serif', color: "primary.main", fontSize: { xs: "1.75rem", sm: "2rem" }, letterSpacing: "-0.03em" }}
            >
              Campe Wallet
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Sign in to your wallet
            </Typography>
          </Box>

          {sessionExpired && !error && (
            <Alert severity="warning" sx={{ mb: 2, borderRadius: 2 }}>
              Session expired due to inactivity. Please sign in again.
            </Alert>
          )}
          {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}
          {justRegisteredEmail && !error && (
            <Alert severity={pendingApproval ? "warning" : "success"} sx={{ mb: 2, borderRadius: 2 }}>
              {pendingApproval
                ? `Account created for ${justRegisteredEmail}. Please wait for admin approval before signing in.`
                : `Account created for ${justRegisteredEmail}. Please sign in.`}
            </Alert>
          )}
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
            <Typography variant="body2" sx={{ mt: 1 }}>
              <Link component="button" type="button" onClick={() => setInfoOpen(true)} underline="hover" fontWeight={500}>
                Forgot password?
              </Link>
            </Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
              <Link component="button" type="button" onClick={openResetDialog} underline="hover" fontWeight={500}>
                Reset password
              </Link>
            </Typography>
          </Box>
        </CardContent>
      </Card>

      <Dialog open={infoOpen} onClose={closeInfoDialog} fullWidth maxWidth="xs">
        <DialogTitle>Forgot password?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Request from the admin a recovery code for you to be able to change your account password.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button type="button" onClick={closeInfoDialog}>Cancel</Button>
          <Button type="button" variant="contained" onClick={handleProceedToRequest}>Proceed</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={requestOpen} onClose={closeRequestDialog} fullWidth maxWidth="xs">
        <DialogTitle>Request recovery code</DialogTitle>
        <Box component="form" onSubmit={handleRequestSubmit}>
          <DialogContent>
            <TextField fullWidth label="Email" type="email" value={requestEmail} onChange={(e) => setRequestEmail(e.target.value)} required margin="normal" autoComplete="email" error={!!requestError} />
            {requestError && <Alert severity="error" sx={{ mt: 2, borderRadius: 2 }}>{requestError}</Alert>}
            {requestSuccess && <Alert severity="success" sx={{ mt: 2, borderRadius: 2 }}>{requestSuccess}</Alert>}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button type="button" onClick={closeRequestDialog}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={requesting}>{requesting ? "Submitting..." : "Submit"}</Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Dialog open={resetOpen} onClose={closeResetDialog} fullWidth maxWidth="xs">
        <DialogTitle>Reset password</DialogTitle>
        <Box component="form" onSubmit={handleResetSubmit}>
          <DialogContent>
            <TextField fullWidth label="Recovery Code" value={resetCode} onChange={(e) => setResetCode(e.target.value)} required margin="normal" autoComplete="one-time-code" />
            <TextField fullWidth label="New Password" type="password" value={resetNew} onChange={(e) => setResetNew(e.target.value)} required margin="normal" helperText="At least 8 characters" autoComplete="new-password" />
            <TextField fullWidth label="Confirm New Password" type="password" value={resetConfirm} onChange={(e) => setResetConfirm(e.target.value)} required margin="normal" autoComplete="new-password" />
            {resetError && <Alert severity="error" sx={{ mt: 2, borderRadius: 2 }}>{resetError}</Alert>}
            {resetSuccess && <Alert severity="success" sx={{ mt: 2, borderRadius: 2 }}>{resetSuccess}</Alert>}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button type="button" onClick={closeResetDialog}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={resetting}>{resetting ? "Saving..." : "Submit"}</Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Box>
  );
}
