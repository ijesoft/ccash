import { useState } from "react";
import { Box, Typography, TextField, Button, Alert, Card, CardContent, Chip, Stack, Divider, Dialog, DialogTitle, DialogContent, DialogActions } from "@mui/material";
import { useMutation } from "@apollo/client";
import { gql } from "@apollo/client";
import { useAuth } from "../context/AuthContext";

const SETUP_2FA = gql`
  mutation Setup2fa {
    setup2fa {
      secret
      uri
    }
  }
`;

const ENABLE_2FA = gql`
  mutation Enable2fa($secret: String!, $code: String!) {
    enable2fa(secret: $secret, code: $code)
  }
`;

const CHANGE_PASSWORD = gql`
  mutation ChangePassword($currentPassword: String!, $newPassword: String!) {
    changePassword(currentPassword: $currentPassword, newPassword: $newPassword)
  }
`;

function qrImageUrl(payload: string, size = 180) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(payload)}`;
}

export default function Profile() {
  const { user } = useAuth();
  const [setup2fa, { data: setupData }] = useMutation(SETUP_2FA);
  const [enable2fa, { loading }] = useMutation(ENABLE_2FA);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [changePassword] = useMutation(CHANGE_PASSWORD);
  const [cpOpen, setCpOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [cpError, setCpError] = useState("");
  const [cpSuccess, setCpSuccess] = useState("");

  const handleSetup2fa = async () => {
    try {
      await setup2fa();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleEnable2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    try {
      await enable2fa({ variables: { secret: setupData?.setup2fa?.secret, code } });
      setSuccess("2FA enabled successfully");
      setCode("");
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setCpError("");
    setCpSuccess("");
    if (newPassword !== confirmPassword) {
      setCpError("Passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      setCpError("Password must be at least 8 characters");
      return;
    }
    try {
      await changePassword({ variables: { currentPassword, newPassword } });
      setCpSuccess("Password changed successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setCpError(err.message);
    }
  };

  return (
    <Box sx={{ maxWidth: 600, mx: "auto" }} className="animate-fade-in">
      <Typography
        fontWeight={700}
        mb={2.5}
        sx={{ fontFamily: '"League Spartan", sans-serif', fontSize: { xs: "1.35rem", sm: "1.5rem" } }}
      >
        Profile
      </Typography>

      <Card sx={{ mb: 2.5, borderRadius: 3 }}>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography variant="subtitle1" fontWeight={700} mb={2}>
            Account Information
          </Typography>
          <Stack spacing={1.5} divider={<Divider flexItem />}>
            <InfoRow label="Email" value={user?.email ?? "—"} />
            <InfoRow label="Phone" value={user?.phone ?? "—"} />
            {user?.idNo && <InfoRow label="ID No. (required at login)" value={user.idNo} />}
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
              <Typography variant="body2" color="text.secondary">Status</Typography>
              <Chip label={user?.status} size="small" color={user?.status === "ACTIVE" ? "success" : "warning"} />
            </Box>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
              <Typography variant="body2" color="text.secondary">KYC Level</Typography>
              <Chip label={user?.kycLevel} size="small" variant="outlined" />
            </Box>
            <InfoRow label="2FA" value={user?.is2faEnabled ? "Enabled" : "Disabled"} />
          </Stack>
          <Button variant="outlined" onClick={() => { setCpOpen(true); setCpError(""); setCpSuccess(""); }} sx={{ mt: 2, minHeight: 44 }}>
            Change Password
          </Button>
        </CardContent>
      </Card>

      <Card sx={{ mb: 2.5, borderRadius: 3 }}>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography variant="subtitle1" fontWeight={700} mb={2}>
            Two-Factor Authentication
          </Typography>
          {user?.is2faEnabled ? (
            <Alert severity="info" sx={{ borderRadius: 2 }}>2FA is enabled on your account.</Alert>
          ) : (
            <>
              {!setupData?.setup2fa ? (
                <Button variant="contained" onClick={handleSetup2fa} sx={{ minHeight: 48 }}>
                  Setup 2FA
                </Button>
              ) : (
                <Box component="form" onSubmit={handleEnable2fa}>
                  <Typography variant="body2" color="text.secondary" mb={2}>
                    Scan this QR code with Google Authenticator or enter the secret manually.
                  </Typography>
                  {setupData.setup2fa.uri && (
                    <Box textAlign="center" mb={2}>
                      <Box
                        component="img"
                        src={qrImageUrl(setupData.setup2fa.uri)}
                        alt="2FA QR"
                        sx={{ width: 180, height: 180, maxWidth: "100%" }}
                      />
                    </Box>
                  )}
                  <TextField
                    fullWidth
                    label="Secret"
                    value={setupData.setup2fa.secret}
                    slotProps={{ input: { readOnly: true } }}
                    sx={{ mb: 2 }}
                  />
                  <TextField
                    fullWidth
                    label="Verification Code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                    inputProps={{ inputMode: "numeric", maxLength: 6 }}
                    sx={{ mb: 2 }}
                  />
                  {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}
                  {success && <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>{success}</Alert>}
                  <Button type="submit" variant="contained" disabled={loading} fullWidth sx={{ minHeight: 48 }}>
                    Verify & Enable
                  </Button>
                </Box>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={cpOpen} onClose={() => setCpOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Change Password</DialogTitle>
        <Box component="form" onSubmit={handleChangePassword}>
          <DialogContent>
            <TextField fullWidth label="Current Password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required margin="normal" autoComplete="current-password" />
            <TextField fullWidth label="New Password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required margin="normal" helperText="At least 8 characters" autoComplete="new-password" />
            <TextField fullWidth label="Confirm New Password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required margin="normal" autoComplete="new-password" />
            {cpError && <Alert severity="error" sx={{ mt: 2, borderRadius: 2 }}>{cpError}</Alert>}
            {cpSuccess && <Alert severity="success" sx={{ mt: 2, borderRadius: 2 }}>{cpSuccess}</Alert>}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setCpOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained">Save New Password</Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Box>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2 }}>
      <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={600} sx={{ textAlign: "right", wordBreak: "break-word" }}>
        {value}
      </Typography>
    </Box>
  );
}
