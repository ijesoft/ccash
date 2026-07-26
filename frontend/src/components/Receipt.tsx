import { Card, CardContent, Typography, Box, Chip, Button } from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import ShareIcon from "@mui/icons-material/Share";
import type { Transaction } from "../types";
import { formatMoney, formatDate } from "../utils/format";

interface Props {
  transaction: Transaction;
}

export default function Receipt({ transaction }: Props) {
  const direction = transaction.direction;
  const incoming = direction === "IN";

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="h6" fontWeight="bold" textAlign="center" gutterBottom>
          {incoming ? "Money Received" : "Money Sent"}
        </Typography>

        <Box sx={{ textAlign: "center", my: 3 }}>
          <Typography variant="h4" fontWeight="bold" color={incoming ? "success.main" : "error.main"}>
            {incoming ? "+" : "-"}
            {formatMoney(transaction.amount.cents)}
          </Typography>
        </Box>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between" }}>
            <Typography variant="body2" color="text.secondary">Reference</Typography>
            <Typography variant="body2" fontWeight="bold">{transaction.reference}</Typography>
          </Box>
          <Box sx={{ display: "flex", justifyContent: "space-between" }}>
            <Typography variant="body2" color="text.secondary">Date</Typography>
            <Typography variant="body2">{formatDate(transaction.createdAt)}</Typography>
          </Box>
          <Box sx={{ display: "flex", justifyContent: "space-between" }}>
            <Typography variant="body2" color="text.secondary">Recipient</Typography>
            <Typography variant="body2">
              {transaction.counterparty?.name || transaction.counterparty?.maskedMobile || "Unknown"}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", justifyContent: "space-between" }}>
            <Typography variant="body2" color="text.secondary">Status</Typography>
            <Chip label={transaction.status} size="small" color={transaction.status === "SUCCESS" ? "success" : "default"} />
          </Box>
          {transaction.description && (
            <Box sx={{ display: "flex", justifyContent: "space-between" }}>
              <Typography variant="body2" color="text.secondary">Note</Typography>
              <Typography variant="body2">{transaction.description}</Typography>
            </Box>
          )}
        </Box>

        <Box sx={{ display: "flex", gap: 2, mt: 3, justifyContent: "center" }}>
          <Button variant="outlined" size="small" startIcon={<ShareIcon />}>
            Share
          </Button>
          <Button variant="outlined" size="small" startIcon={<DownloadIcon />}>
            Download
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}