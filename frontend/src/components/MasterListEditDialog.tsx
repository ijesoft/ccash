import { useEffect, useState } from "react";
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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from "@mui/material";
import { useMutation } from "@apollo/client";
import { GET_MASTER_LIST, MASTER_LIST_UPDATE_ENTRY } from "../graphql/queries/masterList";

export interface MasterListRow {
  id: string;
  idNo: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  mobileNumber: string;
  email: string;
  status: string;
}

interface Props {
  open: boolean;
  entry: MasterListRow | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export default function MasterListEditDialog({ open, entry, onClose, onSaved }: Props) {
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE">("ACTIVE");
  const [error, setError] = useState("");
  const [updateEntry, { loading }] = useMutation(MASTER_LIST_UPDATE_ENTRY, {
    refetchQueries: [{ query: GET_MASTER_LIST }],
  });

  useEffect(() => {
    if (entry && open) {
      setLastName(entry.lastName ?? "");
      setFirstName(entry.firstName ?? "");
      setMiddleName(entry.middleName ?? "");
      setMobileNumber(entry.mobileNumber ?? "");
      setEmail(entry.email ?? "");
      setStatus(entry.status === "INACTIVE" ? "INACTIVE" : "ACTIVE");
      setError("");
    }
  }, [entry, open]);

  const handleClose = () => {
    setError("");
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entry) return;
    setError("");
    try {
      await updateEntry({
        variables: {
          entryId: entry.id,
          input: {
            lastName,
            firstName,
            middleName: middleName || null,
            mobileNumber,
            email,
            status,
          },
        },
      });
      onSaved(`Member ${entry.idNo} updated`);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update entry");
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <Box component="form" onSubmit={handleSubmit}>
        <DialogTitle>Edit Master List Member</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <TextField
              label="9-Digit ID No."
              value={entry?.idNo ?? ""}
              disabled
              fullWidth
              helperText="ID No. is fixed and cannot be edited"
            />
            <Stack direction="row" spacing={1.5}>
              <TextField label="Last Name" value={lastName} onChange={(e) => setLastName(e.target.value)} required fullWidth />
              <TextField label="First Name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required fullWidth />
            </Stack>
            <TextField label="Middle Name" value={middleName} onChange={(e) => setMiddleName(e.target.value)} fullWidth />
            <TextField
              label="Mobile Number"
              value={mobileNumber}
              onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, "").slice(0, 11))}
              required
              fullWidth
              placeholder="09171234567"
              inputProps={{ inputMode: "numeric", maxLength: 11 }}
            />
            <TextField label="Email Address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required fullWidth />
            <FormControl fullWidth>
              <InputLabel>Status</InputLabel>
              <Select
                value={status}
                label="Status"
                onChange={(e) => setStatus(e.target.value as "ACTIVE" | "INACTIVE")}
              >
                <MenuItem value="ACTIVE">Active</MenuItem>
                <MenuItem value="INACTIVE">Inactive</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={loading}>
            {loading ? "Saving..." : "Save Changes"}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
