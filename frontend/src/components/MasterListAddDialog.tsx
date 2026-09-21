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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from "@mui/material";
import { useMutation } from "@apollo/client";
import { GET_MASTER_LIST, MASTER_LIST_CREATE_ENTRY } from "../graphql/queries/masterList";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function MasterListAddDialog({ open, onClose }: Props) {
  const [idNo, setIdNo] = useState("");
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE">("ACTIVE");
  const [error, setError] = useState("");
  const [createEntry, { loading }] = useMutation(MASTER_LIST_CREATE_ENTRY, {
    refetchQueries: [{ query: GET_MASTER_LIST }],
  });

  const reset = () => {
    setIdNo("");
    setLastName("");
    setFirstName("");
    setMiddleName("");
    setMobileNumber("");
    setEmail("");
    setStatus("ACTIVE");
    setError("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await createEntry({
        variables: {
          input: {
            idNo,
            lastName,
            firstName,
            middleName: middleName || null,
            mobileNumber,
            email,
            status,
          },
        },
      });
      reset();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add entry");
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <Box component="form" onSubmit={handleSubmit}>
        <DialogTitle>Add Master List Member</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <TextField
              label="9-Digit ID No."
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
            {loading ? "Adding..." : "Add Member"}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
