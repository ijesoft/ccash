import { useState } from "react";
import {
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Stack,
  Alert,
  Typography,
} from "@mui/material";
import { useMutation } from "@apollo/client";
import { ADMIN_CREATE_MEMBER } from "../graphql/queries/admin";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function AddMemberDialog({ open, onClose, onCreated }: Props) {
  const [idNo, setIdNo] = useState("");
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ email: string; password: string } | null>(null);
  const [adminCreateMember, { loading }] = useMutation(ADMIN_CREATE_MEMBER);

  const reset = () => {
    setIdNo("");
    setLastName("");
    setFirstName("");
    setMiddleName("");
    setEmail("");
    setMobile("");
    setError("");
    setResult(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const { data } = await adminCreateMember({
        variables: {
          input: {
            idNo,
            lastName,
            firstName,
            middleName: middleName || null,
            email,
            mobile,
          },
        },
      });
      setResult({
        email: data.adminCreateMember.user.email,
        password: data.adminCreateMember.temporaryPassword,
      });
      onCreated();
    } catch (err: any) {
      setError(err.message || "Failed to add member");
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>Add Member</DialogTitle>
      {result ? (
        <>
          <DialogContent>
            <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>
              Member created and activated.
            </Alert>
            <Typography variant="body2" color="text.secondary">Email</Typography>
            <Typography fontWeight={600} mb={1.5}>{result.email}</Typography>
            <Typography variant="body2" color="text.secondary">Temporary password</Typography>
            <Typography fontWeight={600} fontFamily="monospace" mb={1.5}>{result.password}</Typography>
            <Typography variant="caption" color="text.secondary">
              This was also emailed to the member. It is shown here only once — save it now if you need to
              hand it over directly.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => reset()}>Add another</Button>
            <Button onClick={handleClose} variant="contained">Done</Button>
          </DialogActions>
        </>
      ) : (
        <Box component="form" onSubmit={handleSubmit}>
          <DialogContent>
            {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}
            <Stack spacing={1.5}>
              <TextField
                label="ID No."
                value={idNo}
                onChange={(e) => setIdNo(e.target.value.replace(/\D/g, "").slice(0, 9))}
                required
                fullWidth
                placeholder="123456789"
                inputProps={{ inputMode: "numeric", maxLength: 9 }}
              />
              <Stack direction="row" spacing={1.5}>
                <TextField label="Last Name" value={lastName} onChange={(e) => setLastName(e.target.value)} required fullWidth />
                <TextField label="First Name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required fullWidth />
              </Stack>
              <TextField label="Middle Name" value={middleName} onChange={(e) => setMiddleName(e.target.value)} fullWidth />
              <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required fullWidth />
              <TextField
                label="Mobile Number"
                value={mobile}
                onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 11))}
                required
                fullWidth
                placeholder="09171234567"
                inputProps={{ inputMode: "numeric", maxLength: 11 }}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleClose}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={loading}>
              {loading ? "Creating..." : "Create Member"}
            </Button>
          </DialogActions>
        </Box>
      )}
    </Dialog>
  );
}
