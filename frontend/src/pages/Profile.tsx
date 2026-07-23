import { useState } from "react";
import { Box, Typography, TextField, Button, Alert, Card, CardContent, Chip } from "@mui/material";
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

export default function Profile() {
  const { user } = useAuth();
  const [setup2fa, { data: setupData }] = useMutation(SETUP_2FA);
  const [enable2fa, { loading }] = useMutation(ENABLE_2FA);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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

  return (
    <Box sx={{ maxWidth: 600, mx: "auto" }}>
      <Typography variant="h5" fontWeight="bold" mb={3}>Profile</Typography>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight="bold" mb={2}>Account Information</Typography>
          <Typography>Email: {user?.email}</Typography>
          <Typography>Phone: {user?.phone}</Typography>
          <Typography>Status: <Chip label={user?.status} size="small" color={user?.status === "ACTIVE" ? "success" : "warning"} /></Typography>
          <Typography>KYC Level: <Chip label={user?.kycLevel} size="small" variant="outlined" /></Typography>
          <Typography>2FA: {user?.is2faEnabled ? "Enabled" : "Disabled"}</Typography>
        </CardContent>
      </Card>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight="bold" mb={2}>Two-Factor Authentication</Typography>
          {user?.is2faEnabled ? (
            <Alert severity="info">2FA is enabled on your account.</Alert>
          ) : (
            <>
              {!setupData?.setup2fa ? (
                <Button variant="contained" onClick={handleSetup2fa}>Setup 2FA</Button>
              ) : (
                <Box component="form" onSubmit={handleEnable2fa}>
                  <Typography variant="body2" color="text.secondary" mb={2}>
                    Scan this QR code with Google Authenticator or enter the secret manually.
                  </Typography>
                  <TextField fullWidth label="Secret" value={setupData.setup2fa.secret} slotProps={{ input: { readOnly: true } }} sx={{ mb: 2 }} />
                  <TextField fullWidth label="Verification Code" value={code} onChange={(e) => setCode(e.target.value)} required sx={{ mb: 2 }} />
                  {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                  {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
                  <Button type="submit" variant="contained" disabled={loading}>Verify & Enable</Button>
                </Box>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}