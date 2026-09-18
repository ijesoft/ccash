import { useEffect, useState } from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";

interface Props {
  open: boolean;
  countdownSec: number;
  onStay: () => void;
  onLogout: () => void;
}

export default function SessionTimeoutDialog({ open, countdownSec, onStay, onLogout }: Props) {
  const [remaining, setRemaining] = useState(countdownSec);

  useEffect(() => {
    setRemaining(countdownSec);
    if (!open) return;
    const id = setInterval(() => setRemaining((r: number) => (r > 0 ? r - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [open, countdownSec]);

  return (
    <Dialog open={open} onClose={onStay} maxWidth="xs" fullWidth>
      <DialogTitle>Session expiring</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary">
          You&apos;ve been inactive. For your security you&apos;ll be logged out in{" "}
          <strong>{remaining}s</strong>. Any unsaved activity will be lost.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onLogout} color="inherit">Log out now</Button>
        <Button onClick={onStay} variant="contained" autoFocus>Stay logged in</Button>
      </DialogActions>
    </Dialog>
  );
}
