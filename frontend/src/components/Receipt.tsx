import { Card, CardContent, Typography, Box, Chip, Button, Avatar } from "@mui/material";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import DownloadIcon from "@mui/icons-material/Download";
import ShareIcon from "@mui/icons-material/Share";
import type { Transaction } from "../types";
import { formatDate, formatMoney } from "../utils/format";

interface Props {
  transaction: Transaction;
}

export default function Receipt({ transaction }: Props) {
  const incoming = transaction.direction === "IN";

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
            {incoming ? "Money Received" : "Money Sent"}
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
              {incoming ? "+" : "-"}
              {formatMoney(transaction.amount.cents)}
            </Typography>
          </Box>
          <InfoRow label="Reference" value={transaction.reference ?? "—"} />
          <InfoRow label="Date" value={formatDate(transaction.createdAt)} />
          <InfoRow label="Recipient" value={transaction.counterparty?.name || transaction.counterparty?.maskedMobile || "Unknown"} />
          {transaction.description && <InfoRow label="Note" value={transaction.description} />}
        </Box>

        <Box sx={{ display: "flex", gap: 2, mt: 3, justifyContent: "center" }}>
          <Button variant="outlined" size="small" startIcon={<ShareIcon />} sx={{ borderRadius: 2 }}>
            Share
          </Button>
          <Button variant="outlined" size="small" startIcon={<DownloadIcon />} sx={{ borderRadius: 2 }}>
            Save
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