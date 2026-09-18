import { useEffect, useState } from "react";
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Alert, Typography } from "@mui/material";
import { useMutation } from "@apollo/client";
import { ADMIN_RESET_PASSWORD } from "../graphql/queries/admin";

interface Props {
  open: boolean;
  onClose: () => void;
  userId: string;
  email: string;
}

export default function ResetPasswordDialog({ open, onClose, userId, email }: Props) {
  const [error, setError] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [resetPassword, { loading }] = useMutation(ADMIN_RESET_PASSWORD);

  useEffect(() => {
    if (open) {
      setError("");
      setResult(null);
    }
  }, [open]);

  const handleConfirm = async () => {
    setError("");
    try {
      const { data } = await resetPassword({ variables: { userId } });
      setResult(data.adminResetPassword.temporaryPassword);
    } catch (err: any) {
      setError(err.message || "Failed to reset password");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Reset Password</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}
        {!result ? (
          <Typography variant="body2" color="text.secondary">
            This generates a new temporary password for <strong>{email}</strong> and emails it to them.
            Their current password will stop working immediately. Continue?
          </Typography>
        ) : (
          <>
            <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>
              Password reset and emailed to {email}.
            </Alert>
            <Typography variant="body2" color="text.secondary">New temporary password</Typography>
            <Typography fontWeight={600} fontFamily="monospace" mb={1.5}>{result}</Typography>
            <Typography variant="caption" color="text.secondary">
              Shown here only once — save it now if you need to hand it over directly.
            </Typography>
          </>
        )}
      </DialogContent>
      <DialogActions>
        {!result ? (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="contained" color="warning" onClick={handleConfirm} disabled={loading}>
              {loading ? "Resetting..." : "Reset Password"}
            </Button>
          </>
        ) : (
          <Button onClick={onClose} variant="contained">Done</Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
