import { useState } from "react";
import { useNavigate, Link as RouterLink } from "react-router-dom";
import { Box, Button, Card, CardContent, TextField, Typography, Alert, Link, Stack } from "@mui/material";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import { useMutation } from "@apollo/client";
import { REGISTER } from "../graphql/mutations/auth";
import BrandMark from "../components/BrandMark";

export default function Register() {
  const [idNo, setIdNo] = useState("");
  const [idNoError, setIdNoError] = useState("");
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [registerMutation, { loading }] = useMutation(REGISTER);
  const navigate = useNavigate();

  const validatePhone = (value: string): string | null => {
    if (!/^\d+$/.test(value)) {
      return "Phone must contain digits only (no letters or symbols)";
    }
    if (value.length !== 11) {
      return "Phone must be exactly 11 digits";
    }
    return null;
  };

  const validateIdNo = (value: string): string | null => {
    if (!/^\d+$/.test(value)) {
      return "ID No. must contain digits only (no letters or symbols)";
    }
    if (value.length !== 9) {
      return "ID No. must be exactly 9 digits";
    }
    return null;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // strip non-digits instantly so letters/symbols never persist
    const digitsOnly = e.target.value.replace(/\D/g, "").slice(0, 11);
    setPhone(digitsOnly);
    if (phoneError) setPhoneError("");
    if (error) setError("");
  };

  const handleIdNoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digitsOnly = e.target.value.replace(/\D/g, "").slice(0, 9);
    setIdNo(digitsOnly);
    if (idNoError) setIdNoError("");
    if (error) setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setPhoneError("");
    setIdNoError("");

    const idNoValidationError = validateIdNo(idNo);
    if (idNoValidationError) {
      setIdNoError(idNoValidationError);
      setError(idNoValidationError);
      return;
    }

    const phoneValidationError = validatePhone(phone);
    if (phoneValidationError) {
      setPhoneError(phoneValidationError);
      setError(phoneValidationError);
      return;
    }

    if (!lastName.trim() || !firstName.trim()) {
      setError("First name and last name are required");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    try {
      await registerMutation({
        variables: {
          email,
          phone,
          password,
          idNo,
          firstName,
          lastName,
          middleName: middleName || null,
        },
      });
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
        sx={{ maxWidth: 460, width: "100%", borderRadius: 4, boxShadow: "0 16px 40px rgba(15,110,205,0.12)" }}
      >
        <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
          <Box sx={{ textAlign: "center", mb: 3 }}>
            <BrandMark icon={<PersonAddIcon sx={{ fontSize: 30, color: "white" }} />} />
            <Typography
              fontWeight={700}
              sx={{ fontFamily: '"League Spartan", sans-serif', color: "primary.main", fontSize: { xs: "1.75rem", sm: "2rem" }, letterSpacing: "-0.03em" }}
            >
              Campe Wallet
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Member Sign-Up
            </Typography>
          </Box>

          {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="ID No."
              value={idNo}
              onChange={handleIdNoChange}
              onBlur={() => {
                const err = idNo ? validateIdNo(idNo) : null;
                if (err) setIdNoError(err);
              }}
              required
              margin="normal"
              placeholder="123456789"
              helperText={idNoError || "Your 9-digit employee/member ID"}
              error={!!idNoError}
              inputProps={{ inputMode: "numeric", pattern: "[0-9]*", maxLength: 9 }}
            />

            <Stack direction={{ xs: "column", sm: "row" }} spacing={{ xs: 0, sm: 1.5 }} sx={{ "& > *": { flex: 1 } }}>
              <TextField
                fullWidth
                label="Last Name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                margin="normal"
                autoComplete="family-name"
              />
              <TextField
                fullWidth
                label="First Name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                margin="normal"
                autoComplete="given-name"
              />
            </Stack>
            <TextField
              fullWidth
              label="Middle Name"
              value={middleName}
              onChange={(e) => setMiddleName(e.target.value)}
              margin="normal"
              helperText="Optional"
              autoComplete="additional-name"
            />

            <TextField
              fullWidth
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              margin="normal"
              autoComplete="email"
              helperText="Your transaction history can be sent here as a PDF"
            />
            <TextField
              fullWidth
              label="Mobile Number"
              value={phone}
              onChange={handlePhoneChange}
              onBlur={() => {
                const err = phone ? validatePhone(phone) : null;
                if (err) setPhoneError(err);
              }}
              required
              margin="normal"
              placeholder="09171234567"
              helperText={phoneError || "Exactly 11 digits (numbers only)"}
              error={!!phoneError}
              inputProps={{ inputMode: "numeric", pattern: "[0-9]*", maxLength: 11 }}
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
            <Typography variant="body2" sx={{ mt: 1 }}>
              <Link component={RouterLink} to="/register-merchant" underline="hover" fontWeight={500}>
                Signing up as a Merchant instead?
              </Link>
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
