import { useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  Divider,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import { formatMoney } from "../utils/format";

export interface ReceiptRow {
  label: string;
  value: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  amountCents: number;
  signPrefix?: "+" | "−";
  rows?: ReceiptRow[];
  reference?: string | null;
  primaryLabel?: string;
  onPrimary?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

export default function SuccessDialog({
  open,
  onClose,
  title,
  subtitle,
  amountCents,
  signPrefix,
  rows = [],
  reference,
  primaryLabel = "Done",
  onPrimary,
  secondaryLabel,
  onSecondary,
}: Props) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!reference) return;
    try {
      await navigator.clipboard.writeText(reference);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={fullScreen}
      maxWidth="xs"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: fullScreen ? 0 : 4,
            overflow: "hidden",
          },
        },
      }}
    >
      <Box
        sx={{
          position: "relative",
          pt: { xs: "calc(40px + var(--safe-top))", sm: 5 },
          pb: 4,
          px: 3,
          textAlign: "center",
          background: "linear-gradient(160deg, #00b894 0%, #009e7f 100%)",
          color: "white",
        }}
      >
        <IconButton
          onClick={onClose}
          aria-label="Close"
          sx={{ position: "absolute", top: "calc(8px + var(--safe-top))", right: 8, color: "rgba(255,255,255,0.9)" }}
        >
          <CloseIcon />
        </IconButton>

        <Box sx={{ position: "relative", width: 84, height: 84, mx: "auto", mb: 2 }}>
          <Box
            className="success-ring"
            sx={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: "2px solid rgba(255,255,255,0.7)",
            }}
          />
          <Box
            className="success-badge"
            sx={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              bgcolor: "rgba(255,255,255,0.18)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CheckIcon sx={{ fontSize: 46, color: "white" }} />
          </Box>
        </Box>

        <Typography
          fontWeight={700}
          sx={{ fontFamily: '"League Spartan", sans-serif', fontSize: { xs: "1.35rem", sm: "1.5rem" }, letterSpacing: "-0.02em" }}
        >
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body2" sx={{ opacity: 0.9, mt: 0.5 }}>
            {subtitle}
          </Typography>
        )}

        <Typography
          fontWeight={700}
          sx={{
            fontFamily: '"League Spartan", sans-serif',
            fontSize: { xs: "2.1rem", sm: "2.4rem" },
            mt: 1.5,
            letterSpacing: "-0.03em",
            wordBreak: "break-word",
          }}
        >
          {signPrefix}
          {formatMoney(amountCents)}
        </Typography>
      </Box>

      <DialogContent sx={{ px: { xs: 2.5, sm: 3 }, py: 3 }}>
        <Stack spacing={1.75} divider={<Divider flexItem />}>
          {rows.map((row) => (
            <Box
              key={row.label}
              sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2 }}
            >
              <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
                {row.label}
              </Typography>
              <Typography variant="body2" fontWeight={600} sx={{ textAlign: "right", wordBreak: "break-word" }}>
                {row.value}
              </Typography>
            </Box>
          ))}

          {reference && (
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
                Reference
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0 }}>
                <Typography
                  variant="body2"
                  fontWeight={600}
                  sx={{ fontFamily: "monospace", fontSize: "0.75rem", wordBreak: "break-all", textAlign: "right" }}
                >
                  {reference}
                </Typography>
                <Tooltip title={copied ? "Copied" : "Copy reference"}>
                  <IconButton size="small" onClick={handleCopy} aria-label="Copy reference" sx={{ flexShrink: 0 }}>
                    {copied ? (
                      <CheckIcon fontSize="small" color="success" />
                    ) : (
                      <ContentCopyIcon sx={{ fontSize: 16 }} />
                    )}
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>
          )}
        </Stack>

        <Stack spacing={1.25} sx={{ mt: 3.5 }}>
          <Button
            fullWidth
            variant="contained"
            size="large"
            onClick={onPrimary ?? onClose}
            sx={{ minHeight: 48, borderRadius: 2 }}
          >
            {primaryLabel}
          </Button>
          {secondaryLabel && (
            <Button
              fullWidth
              variant="outlined"
              onClick={onSecondary ?? onClose}
              sx={{ minHeight: 48, borderRadius: 2 }}
            >
              {secondaryLabel}
            </Button>
          )}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
