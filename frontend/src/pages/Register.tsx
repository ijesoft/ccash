import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Box, Button, Card, CardContent, TextField, Typography, Alert } from "@mui/material";
import { useMutation } from "@apollo/client";
import { REGISTER } from "../graphql/mutations/auth";

export default function Register() {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [registerMutation, { loading }] = useMutation(REGISTER);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    try {
      await registerMutation({ variables: { email, phone, password } });
      navigate(`/verify-otp?email=${encodeURIComponent(email)}`);
    } catch (err: any) {
      setError(err.message || "Registration failed");
    }
  };

  return (
    <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", bgcolor: "#f5f5f5" }}>
      <Card sx={{ maxWidth: 400, width: "100%", mx: 2 }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h4" fontWeight="bold" color="primary" textAlign="center" gutterBottom>CCash</Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center" mb={3}>Create your account</Typography>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <Box component="form" onSubmit={handleSubmit}>
            <TextField fullWidth label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required sx={{ mb: 2 }} />
            <TextField fullWidth label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} required sx={{ mb: 2 }} placeholder="09171234567" />
            <TextField fullWidth label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required sx={{ mb: 2 }} />
            <TextField fullWidth label="Confirm Password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required sx={{ mb: 3 }} />
            <Button fullWidth type="submit" variant="contained" size="large" disabled={loading}>
              {loading ? "Creating account..." : "Create Account"}
            </Button>
          </Box>

          <Typography textAlign="center" mt={2}>
            <Link to="/login" style={{ color: "#0f6ecd" }}>Already have an account? Sign in</Link>
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}