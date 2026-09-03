import { useRef, useState } from "react";
import { Alert, Box, Button, Card, CardContent, Snackbar, Typography } from "@mui/material";
import { useQuery } from "@apollo/client";
import { GET_BRANDING, type BrandingData } from "../graphql/queries/branding";

const UPLOAD_URL = "/api/admin/branding/logo";
const MAX_BYTES = 5 * 1024 * 1024;

export default function BrandingSection() {
  const { data, refetch } = useQuery<BrandingData>(GET_BRANDING);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({
    open: false,
    message: "",
    severity: "success",
  });
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(f.type)) {
      setSnackbar({ open: true, message: "Only PNG, JPG or WebP images are accepted", severity: "error" });
      return;
    }
    if (f.size > MAX_BYTES) {
      setSnackbar({ open: true, message: "Image must be 5MB or smaller", severity: "error" });
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(UPLOAD_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("accessToken") ?? ""}` },
        body: form,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail?.message ?? body?.detail ?? "Upload failed");
      }
      setFile(null);
      setPreview(null);
      await refetch();
      setSnackbar({ open: true, message: "Logo updated for all platforms", severity: "success" });
    } catch (err) {
      setSnackbar({ open: true, message: err instanceof Error ? err.message : "Upload failed", severity: "error" });
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    try {
      const res = await fetch(UPLOAD_URL, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("accessToken") ?? ""}` },
      });
      if (!res.ok) throw new Error("Reset failed");
      await refetch();
      setSnackbar({ open: true, message: "Logo restored to default", severity: "success" });
    } catch (err) {
      setSnackbar({ open: true, message: err instanceof Error ? err.message : "Reset failed", severity: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Typography variant="h6" fontWeight="bold" mb={1}>Branding</Typography>
        <Typography variant="body2" color="text.secondary" mb={2}>
          Upload a logo to regenerate all platform assets (app header, PWA icons, touch icon, favicon). PNG, JPG or WebP up to 5MB — square-cropped automatically.
        </Typography>
        <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap", mb: 2 }}>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(e) => pick(e.target.files?.[0])}
          />
          <Button variant="outlined" onClick={() => inputRef.current?.click()} disabled={busy}>
            Choose file
          </Button>
          <Button variant="contained" onClick={upload} disabled={!file || busy}>
            {busy ? "Working…" : "Upload logo"}
          </Button>
          <Button variant="text" color="secondary" onClick={reset} disabled={busy}>
            Reset to default
          </Button>
        </Box>
        {(preview || data?.branding?.logoUrl) && (
          <Box sx={{ display: "flex", gap: 2, alignItems: "flex-end", flexWrap: "wrap" }}>
            {[96, 48, 24].map((size) => (
              <Box key={size} sx={{ textAlign: "center" }}>
                <img
                  src={preview ?? data!.branding.logoUrl}
                  alt={`Logo preview ${size}px`}
                  width={size}
                  height={size}
                  style={{ objectFit: "contain", borderRadius: 8, border: "1px solid", borderColor: "divider" }}
                />
                <Typography variant="caption" display="block">{size}px</Typography>
              </Box>
            ))}
          </Box>
        )}
        <Snackbar
          open={snackbar.open}
          autoHideDuration={4000}
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        >
          <Alert onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity} variant="filled">
            {snackbar.message}
          </Alert>
        </Snackbar>
      </CardContent>
    </Card>
  );
}
