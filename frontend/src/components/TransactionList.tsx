import { List, ListItem, ListItemText, Typography, Chip, Box } from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import type { Transaction } from "../types";
import { formatDate, formatMoney } from "../utils/format";

interface Props {
  transactions: Transaction[];
}

const typeColors: Record<string, "success" | "error" | "info" | "default"> = {
  CASH_IN: "success",
  CASH_OUT: "error",
  SEND: "error",
  RECEIVE: "success",
  QR_PAYMENT: "info",
};

const typeIcons: Record<string, React.ReactNode> = {
  CASH_IN: <ArrowDownwardIcon fontSize="small" />,
  RECEIVE: <ArrowDownwardIcon fontSize="small" />,
  CASH_OUT: <ArrowUpwardIcon fontSize="small" />,
  SEND: <ArrowUpwardIcon fontSize="small" />,
};

export default function TransactionList({ transactions }: Props) {
  if (!transactions.length) {
    return <Typography color="text.secondary" sx={{ textAlign: "center", py: 4 }}>No transactions yet</Typography>;
  }

  return (
    <List>
      {transactions.map((tx) => (
        <ListItem key={tx.id} divider>
          <Box sx={{ mr: 2 }}>
            {typeIcons[tx.type] ?? null}
          </Box>
          <ListItemText
            primary={tx.description || tx.type.replace("_", " ")}
            secondary={formatDate(tx.createdAt)}
          />
          <Box sx={{ textAlign: "right" }}>
            <Typography variant="body2" fontWeight="bold">
              {["CASH_IN", "RECEIVE"].includes(tx.type) ? "+" : "-"}{formatMoney(tx.amount.cents)}
            </Typography>
            <Chip label={tx.type.replace("_", " ")} size="small" color={typeColors[tx.type] ?? "default"} variant="outlined" />
          </Box>
        </ListItem>
      ))}
    </List>
  );
}