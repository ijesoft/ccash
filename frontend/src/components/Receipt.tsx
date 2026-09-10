import { useState } from "react";
import { Card, CardContent, Typography, Box, Chip, Button, Avatar } from "@mui/material";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import DownloadIcon from "@mui/icons-material/Download";
import ShareIcon from "@mui/icons-material/Share";
import type { Transaction } from "../types";
import { formatDate, formatMoney } from "../utils/format";
import { downloadReceipt, shareReceipt } from "../utils/receiptShare";

interface Props {
  transaction: Transaction;
}

export default function Receipt({ transaction }: Props) {
  const incoming = transaction.direction === "IN";
  const [busy, setBusy] = useState<"share" | "download" | null>(null);
  const [msg, setMsg] = useState("");

  const amountLabel = (incoming ? "+" : "-") + formatMoney(transaction.amount.cents);
  const title = incoming ? "Money Received" : "Money Sent";
  const rows = [
    { label: "Date", value: formatDate(transaction.createdAt) },
    {
      label: incoming ? "From" : "To",
      value: transaction.counterparty?.name || transaction.counterparty?.maskedMobile || "Unknown",
    },
    ...(transaction.description ? [{ label: "Note", value: transaction.description }] : []),
  ];
  const shareData = {
    title,
    subtitle: transaction.status === "SUCCESS" ? "Transaction completed" : transaction.status,
    amountLabel,
    rows,
    reference: transaction.reference ?? transaction.id,
  };

  const handleShare = async () => {
    setBusy("share");
    setMsg("");
    try {
      const result = await shareReceipt(shareData);
      setMsg(
        result === "shared"
          ? "Opened share sheet"
          : result === "text"
            ? "Shared as text; image downloaded"
            : "Image downloaded (share unavailable)",
      );
    } catch (err) {
      setMsg(String((err as Error)?.message || "Share failed"));
    } finally {
      setBusy(null);
    }
  };

  const handleDownload = async () => {
    setBusy("download");
    setMsg("");
    try {
      await downloadReceipt(shareData);
      setMsg("Receipt image saved");
    } catch (err) {
      setMsg(String((err as Error)?.message || "Download failed"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card sx={{ mb: 2, borderRadius: 3, border: "1px solid #f3f4f6" }}>
      <CardContent>
        <Box sx={{ textAlign: "center", mb: 3 }}>
          <Avatar
            sx={{
              bgcolor: incoming ? "success.light" : "error.light",
              color: incoming ? "success.main" : "error.main",
              width: 56,
              height: 56,
              mx: "auto",
              mb: 1,
            }}
          >
            {incoming ? <ArrowDownwardIcon /> : <ArrowUpwardIcon />}
          </Avatar>
          <Typography variant="h6" fontWeight={700}>
            {title}
          </Typography>
          <Chip
            label={transaction.status}
            size="small"
            color={transaction.status === "SUCCESS" ? "success" : "default"}
            sx={{ mt: 1 }}
          />
        </Box>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Typography variant="body2" color="text.secondary">Amount</Typography>
            <Typography variant="h6" fontWeight={700} sx={{ color: incoming ? "success.main" : "text.primary" }}>
              {amountLabel}
            </Typography>
          </Box>
          <InfoRow label="Reference" value={transaction.reference ?? "—"} />
          <InfoRow label="Date" value={formatDate(transaction.createdAt)} />
          <InfoRow label="Recipient" value={transaction.counterparty?.name || transaction.counterparty?.maskedMobile || "Unknown"} />
          {transaction.description && <InfoRow label="Note" value={transaction.description} />}
        </Box>

        {msg && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2, textAlign: "center" }}>
            {msg}
          </Typography>
        )}

        <Box sx={{ display: "flex", gap: 2, mt: 3, justifyContent: "center" }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<ShareIcon />}
            onClick={handleShare}
            disabled={busy !== null}
            sx={{ borderRadius: 2 }}
          >
            {busy === "share" ? "Sharing..." : "Share"}
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<DownloadIcon />}
            onClick={handleDownload}
            disabled={busy !== null}
            sx={{ borderRadius: 2 }}
          >
            {busy === "download" ? "Saving..." : "Save"}
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", py: 0.5 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body2" fontWeight={500}>{value}</Typography>
    </Box>
  );
}
