import { useState } from "react";
import { useNavigate, Link as RouterLink } from "react-router-dom";
import { Box, Button, Card, CardContent, TextField, Typography, Alert, Link } from "@mui/material";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
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
              <PersonAddIcon sx={{ fontSize: 30, color: "white" }} />
            </Box>
            <Typography
              fontWeight={700}
              sx={{ fontFamily: '"League Spartan", sans-serif', color: "primary.main", fontSize: { xs: "1.75rem", sm: "2rem" }, letterSpacing: "-0.03em" }}
            >
              CCash
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Create your account
            </Typography>
          </Box>

          {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

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
              label="Phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              margin="normal"
              placeholder="09171234567"
              inputProps={{ inputMode: "tel" }}
            />
            <TextField
              fullWidth
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              margin="normal"
              helperText="At least 8 characters"
              autoComplete="new-password"
            />
            <TextField
              fullWidth
              label="Confirm Password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              margin="normal"
              autoComplete="new-password"
            />
            <Button
              fullWidth
              type="submit"
              variant="contained"
              size="large"
              disabled={loading}
              sx={{ mt: 2, mb: 1, borderRadius: 2, py: 1.5, minHeight: 48 }}
            >
              {loading ? "Creating account..." : "Create Account"}
            </Button>
          </Box>

          <Box sx={{ textAlign: "center", mt: 3 }}>
            <Link component={RouterLink} to="/login" underline="hover" fontWeight={500}>
              Already have an account? Sign in
            </Link>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
