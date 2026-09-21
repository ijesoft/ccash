import { useState } from "react";
import { useNavigate, Link as RouterLink } from "react-router-dom";
import { Box, Button, Card, CardContent, TextField, Typography, Alert, Link } from "@mui/material";
import StorefrontIcon from "@mui/icons-material/Storefront";
import { useMutation } from "@apollo/client";
import { REGISTER_MERCHANT } from "../graphql/mutations/auth";
import BrandMark from "../components/BrandMark";

export default function MerchantRegister() {
  const [companyName, setCompanyName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [mobileNo, setMobileNo] = useState("");
  const [mobileError, setMobileError] = useState("");
  const [landline, setLandline] = useState("");
  const [address, setAddress] = useState("");
  const [tin, setTin] = useState("");
  const [merchantIdNo, setMerchantIdNo] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [registerMerchant, { loading }] = useMutation(REGISTER_MERCHANT);
  const navigate = useNavigate();

  const validateMobile = (value: string): string | null => {
    if (!/^\d+$/.test(value)) {
      return "Mobile number must contain digits only (no letters or symbols)";
    }
    if (value.length !== 11) {
      return "Mobile number must be exactly 11 digits";
    }
    return null;
  };

  const handleMobileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digitsOnly = e.target.value.replace(/\D/g, "").slice(0, 11);
    setMobileNo(digitsOnly);
    if (mobileError) setMobileError("");
    if (error) setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMobileError("");

    const mobileValidationError = validateMobile(mobileNo);
    if (mobileValidationError) {
      setMobileError(mobileValidationError);
      setError(mobileValidationError);
      return;
    }

    if (!companyName.trim() || !contactPerson.trim() || !address.trim() || !tin.trim()) {
      setError("Please fill in all required fields");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    try {
      await registerMerchant({
        variables: {
          input: {
            email,
            mobileNo,
            password,
            companyName,
            contactPerson,
            address,
            tin,
            landline: landline || null,
            merchantIdNo: merchantIdNo || null,
          },
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
            <BrandMark icon={<StorefrontIcon sx={{ fontSize: 30, color: "white" }} />} />
            <Typography
              fontWeight={700}
              sx={{ fontFamily: '"League Spartan", sans-serif', color: "primary.main", fontSize: { xs: "1.75rem", sm: "2rem" }, letterSpacing: "-0.03em" }}
            >
              Campe Wallet
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Merchant Sign-Up
            </Typography>
          </Box>

          {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Name of Company (or Person, if individual)"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
              margin="normal"
            />
            <TextField
              fullWidth
              label="Contact Person"
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              required
              margin="normal"
            />
            <TextField
              fullWidth
              label="Mobile No."
              value={mobileNo}
              onChange={handleMobileChange}
              onBlur={() => {
                const err = mobileNo ? validateMobile(mobileNo) : null;
                if (err) setMobileError(err);
              }}
              required
              margin="normal"
              placeholder="09171234567"
              helperText={mobileError || "Exactly 11 digits (numbers only)"}
              error={!!mobileError}
              inputProps={{ inputMode: "numeric", pattern: "[0-9]*", maxLength: 11 }}
            />
            <TextField
              fullWidth
              label="Landline"
              value={landline}
              onChange={(e) => setLandline(e.target.value)}
              margin="normal"
              helperText="Optional"
            />
            <TextField
              fullWidth
              label="Address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
              margin="normal"
              multiline
              minRows={2}
            />
            <TextField
              fullWidth
              label="TIN"
              value={tin}
              onChange={(e) => setTin(e.target.value)}
              required
              margin="normal"
            />
            <TextField
              fullWidth
              label="Merchant ID No."
              value={merchantIdNo}
              onChange={(e) => setMerchantIdNo(e.target.value.toUpperCase().slice(0, 10))}
              margin="normal"
              placeholder="M123456789"
              helperText="Leave blank and Campe Wallet will generate one automatically"
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
              helperText="Transaction history for reimbursement to CAMPE can be sent here as a PDF"
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
              {loading ? "Creating account..." : "Create Merchant Account"}
            </Button>
          </Box>

          <Box sx={{ textAlign: "center", mt: 3 }}>
            <Link component={RouterLink} to="/login" underline="hover" fontWeight={500}>
              Already have an account? Sign in
            </Link>
            <Typography variant="body2" sx={{ mt: 1 }}>
              <Link component={RouterLink} to="/register" underline="hover" fontWeight={500}>
                Signing up as a Member instead?
              </Link>
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
