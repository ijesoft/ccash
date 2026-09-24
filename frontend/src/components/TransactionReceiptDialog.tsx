import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
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
import ShareIcon from "@mui/icons-material/Share";
import DownloadIcon from "@mui/icons-material/Download";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import type { Transaction } from "../types";
import { formatDate, formatMoney } from "../utils/format";
import {
  downloadReceipt,
  printReceipt,
  shareReceipt,
  type ReceiptShareData,
} from "../utils/receiptShare";

interface Props {
  transaction: Transaction | null;
  onClose: () => void;
}

const typeLabels: Record<string, string> = {
  CASH_IN: "Cash In",
  CASH_OUT: "Cash Out",
  SEND: "Transfer",
  QR_PAYMENT: "QR Payment",
};

function receiptTitle(tx: Transaction): string {
  const incoming = tx.direction === "IN";
  if (tx.type === "CASH_IN") return "Cash In";
  if (tx.type === "CASH_OUT") return "Cash Out";
  if (tx.type === "SEND") return incoming ? "Transfer Received" : "Transfer Sent";
  if (tx.type === "QR_PAYMENT") return incoming ? "QR Payment Received" : "QR Payment Sent";
  return incoming ? "Money Received" : "Money Sent";
}

export default function TransactionReceiptDialog({ transaction, onClose }: Props) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<"share" | "image" | "pdf" | null>(null);
  const [actionMsg, setActionMsg] = useState("");

  const shareData = useMemo<ReceiptShareData | null>(() => {
    if (!transaction) return null;
    const incoming = transaction.direction === "IN";
    const counterparty =
      transaction.counterparty?.name || transaction.counterparty?.maskedMobile || "—";
    return {
      title: receiptTitle(transaction),
      subtitle: transaction.status === "SUCCESS" ? "Transaction completed" : transaction.status,
      amountLabel: (incoming ? "+" : "−") + formatMoney(transaction.amount.cents),
      rows: [
        { label: "Type", value: typeLabels[transaction.type] ?? transaction.type.replace("_", " ") },
        { label: "Date", value: formatDate(transaction.createdAt) },
        { label: incoming ? "From" : "To", value: counterparty },
        ...(transaction.description ? [{ label: "Note", value: transaction.description }] : []),
        ...(transaction.fee.cents > 0 ? [{ label: "Fee", value: formatMoney(transaction.fee.cents) }] : []),
      ],
      reference: transaction.reference ?? transaction.id,
    };
  }, [transaction]);

  const handleClose = () => {
    setCopied(false);
    setActionMsg("");
    onClose();
  };

  const handleCopy = async () => {
    const ref = shareData?.reference;
    if (!ref) return;
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(ref);
      } else {
        const input = document.createElement("textarea");
        input.value = ref;
        input.setAttribute("readonly", "");
        input.style.position = "fixed";
        input.style.left = "-9999px";
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const handleShare = async () => {
    if (!shareData) return;
    setBusy("share");
    setActionMsg("");
    try {
      const result = await shareReceipt(shareData);
      if (result === "shared") {
        setActionMsg("Opened share sheet — pick Messages, Email, or another app.");
      } else if (result === "text") {
        setActionMsg("Shared as text. Receipt image also downloaded for proof.");
      } else {
        setActionMsg("Share is unavailable here. Receipt image downloaded instead.");
      }
    } catch (err) {
      setActionMsg(String((err as Error)?.message || "Could not share receipt."));
    } finally {
      setBusy(null);
    }
  };

  const handleSaveImage = async () => {
    if (!shareData) return;
    setBusy("image");
    setActionMsg("");
    try {
      await downloadReceipt(shareData);
      setActionMsg("Receipt image saved. Check your Downloads folder.");
    } catch (err) {
      setActionMsg(String((err as Error)?.message || "Could not save receipt image."));
    } finally {
      setBusy(null);
    }
  };

  const handlePdf = () => {
    if (!shareData) return;
    setBusy("pdf");
    setActionMsg("");
    try {
      const opened = printReceipt(shareData);
      setActionMsg(
        opened
          ? "Print dialog opened — choose “Save as PDF” as the destination."
          : "Popup was blocked. Please allow popups for this site and try again.",
      );
    } catch (err) {
      setActionMsg(String((err as Error)?.message || "Could not open receipt for printing."));
    } finally {
      setBusy(null);
    }
  };

  const incoming = transaction?.direction === "IN";

  return (
    <Dialog
      open={transaction !== null}
      onClose={handleClose}
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
      {transaction && shareData && (
        <>
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
              onClick={handleClose}
              aria-label="Close"
              sx={{ position: "absolute", top: "calc(8px + var(--safe-top))", right: 8, color: "rgba(255,255,255,0.9)" }}
            >
              <CloseIcon />
            </IconButton>

            <Box
              sx={{
                width: 64,
                height: 64,
                mx: "auto",
                mb: 2,
                borderRadius: "50%",
                bgcolor: "rgba(255,255,255,0.18)",
                border: "2px solid rgba(255,255,255,0.7)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {incoming ? <ArrowDownwardIcon sx={{ fontSize: 34 }} /> : <ArrowUpwardIcon sx={{ fontSize: 34 }} />}
            </Box>

            <Typography
              fontWeight={700}
              sx={{ fontFamily: '"League Spartan", sans-serif', fontSize: { xs: "1.25rem", sm: "1.4rem" }, letterSpacing: "-0.02em" }}
            >
              {shareData.title}
            </Typography>
            {shareData.subtitle && (
              <Typography variant="body2" sx={{ opacity: 0.9, mt: 0.5 }}>
                {shareData.subtitle}
              </Typography>
            )}

            <Typography
              fontWeight={700}
              sx={{
                fontFamily: '"League Spartan", sans-serif',
                fontSize: { xs: "2rem", sm: "2.2rem" },
                mt: 1.5,
                letterSpacing: "-0.03em",
                wordBreak: "break-word",
              }}
            >
              {shareData.amountLabel}
            </Typography>

            <Chip
              label={transaction.status}
              size="small"
              sx={{ mt: 1.5, bgcolor: "rgba(255,255,255,0.22)", color: "white", fontWeight: 600 }}
            />
          </Box>

          <DialogContent sx={{ px: { xs: 2.5, sm: 3 }, py: 3 }}>
            <Stack spacing={1.75} divider={<Divider flexItem />}>
              {shareData.rows.map((row) => (
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

              {shareData.reference && (
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
                      {shareData.reference}
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

            {actionMsg && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2, textAlign: "center" }}>
                {actionMsg}
              </Typography>
            )}

            <Stack direction="row" spacing={1.25} sx={{ mt: 3 }}>
              <Button
                fullWidth
                variant="outlined"
                startIcon={<ShareIcon />}
                onClick={handleShare}
                disabled={busy !== null}
                sx={{ minHeight: 44, borderRadius: 2 }}
              >
                {busy === "share" ? "Sharing..." : "Share"}
              </Button>
              <Button
                fullWidth
                variant="outlined"
                startIcon={<DownloadIcon />}
                onClick={handleSaveImage}
                disabled={busy !== null}
                sx={{ minHeight: 44, borderRadius: 2 }}
              >
                {busy === "image" ? "Saving..." : "Image"}
              </Button>
              <Button
                fullWidth
                variant="outlined"
                startIcon={<PictureAsPdfIcon />}
                onClick={handlePdf}
                disabled={busy !== null}
                sx={{ minHeight: 44, borderRadius: 2 }}
              >
                {busy === "pdf" ? "Opening..." : "PDF"}
              </Button>
            </Stack>

            <Button
              fullWidth
              variant="contained"
              size="large"
              onClick={handleClose}
              sx={{ minHeight: 48, borderRadius: 2, mt: 1.5 }}
            >
              Done
            </Button>
          </DialogContent>
        </>
      )}
    </Dialog>
  );
}
