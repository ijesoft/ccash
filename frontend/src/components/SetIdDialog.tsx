import { useEffect, useState } from "react";
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Alert, Box } from "@mui/material";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  label: string;
  helperText: string;
  initialValue?: string | null;
  maxLength: number;
  /** Normalizes each keystroke, e.g. digits-only, or "M" + digits uppercased. */
  transform: (raw: string) => string;
  isValid: (value: string) => boolean;
  invalidMessage: string;
  onSubmit: (value: string) => Promise<void>;
}

/** Generic "assign an ID" dialog, reused for both a Member's ID No. (9
 * digits) and a Merchant's Merchant ID (M + 9 digits). */
export default function SetIdDialog({
  open,
  onClose,
  title,
  label,
  helperText,
  initialValue,
  maxLength,
  transform,
  isValid,
  invalidMessage,
  onSubmit,
}: Props) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(initialValue ?? "");
      setError("");
    }
  }, [open, initialValue]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid(value)) {
      setError(invalidMessage);
      return;
    }
    setError("");
    setLoading(true);
    try {
      await onSubmit(value);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <Box component="form" onSubmit={handleSubmit}>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}
          <TextField
            fullWidth
            autoFocus
            label={label}
            value={value}
            onChange={(e) => setValue(transform(e.target.value).slice(0, maxLength))}
            helperText={helperText}
            required
            inputProps={{ maxLength }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={loading}>
            {loading ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
