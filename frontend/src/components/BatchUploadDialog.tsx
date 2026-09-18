import { useRef, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Alert,
  Box,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  LinearProgress,
} from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";

interface RowResult {
  row: number;
  id_no: string;
  email: string;
  status: "created" | "error";
  message: string | null;
}

interface BatchResponse {
  total: number;
  created: number;
  failed: number;
  results: RowResult[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
}

export default function BatchUploadDialog({ open, onClose, onUploaded }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [response, setResponse] = useState<BatchResponse | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setError("");
    setResponse(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleUpload = async () => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/members/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("accessToken") ?? ""}` },
        body: form,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.detail ?? "Batch upload failed");
      }
      setResponse(body as BatchResponse);
      if ((body as BatchResponse).created > 0) onUploaded();
    } catch (err: any) {
      setError(err.message || "Batch upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Batch Upload Members</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" mb={2}>
          Upload a .csv or .xlsx file with columns: ID No., Last Name, First Name, Middle Name
          (optional), Mobile, Email. Each row is created as an active member with a generated
          password emailed to them.
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

        {!response && (
          <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx"
              hidden
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Button variant="outlined" onClick={() => inputRef.current?.click()} disabled={busy}>
              Choose file
            </Button>
            {file && <Typography variant="body2">{file.name}</Typography>}
          </Box>
        )}

        {busy && <LinearProgress sx={{ mt: 2, borderRadius: 1 }} />}

        {response && (
          <>
            <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
              <Chip label={`Total: ${response.total}`} size="small" />
              <Chip label={`Created: ${response.created}`} color="success" size="small" />
              <Chip label={`Failed: ${response.failed}`} color={response.failed ? "error" : "default"} size="small" />
            </Box>
            <Box sx={{ maxHeight: 320, overflow: "auto", border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Row</TableCell>
                    <TableCell>ID No.</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Message</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {response.results.map((r) => (
                    <TableRow key={r.row}>
                      <TableCell>{r.row}</TableCell>
                      <TableCell>{r.id_no}</TableCell>
                      <TableCell>{r.email}</TableCell>
                      <TableCell>
                        <Chip
                          label={r.status}
                          size="small"
                          color={r.status === "created" ? "success" : "error"}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>{r.message ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>{response ? "Done" : "Cancel"}</Button>
        {!response && (
          <Button
            variant="contained"
            startIcon={<UploadFileIcon />}
            onClick={handleUpload}
            disabled={!file || busy}
          >
            {busy ? "Uploading..." : "Upload"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
