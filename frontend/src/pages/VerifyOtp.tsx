import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Box, Button, Card, CardContent, TextField, Typography, Alert } from "@mui/material";
import { useMutation } from "@apollo/client";
import { VERIFY_OTP } from "../graphql/mutations/auth";

export default function VerifyOtp() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email") || "";
  const [verifyOtp, { loading }] = useMutation(VERIFY_OTP);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await verifyOtp({ variables: { email, code } });
      navigate("/login");
    } catch (err: any) {
      setError(err.message || "Verification failed");
    }
  };

  return (
    <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", bgcolor: "#f5f5f5" }}>
      <Card sx={{ maxWidth: 400, width: "100%", mx: 2 }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h4" fontWeight="bold" color="primary" textAlign="center" gutterBottom>Verify OTP</Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center" mb={3}>
            Enter the 6-digit code sent to {email}
          </Typography>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <Box component="form" onSubmit={handleSubmit}>
            <TextField fullWidth label="OTP Code" value={code} onChange={(e) => setCode(e.target.value)} required inputProps={{ maxLength: 6 }} sx={{ mb: 3 }} />
            <Button fullWidth type="submit" variant="contained" size="large" disabled={loading}>
              {loading ? "Verifying..." : "Verify"}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}