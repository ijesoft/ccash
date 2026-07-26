import { List, ListItem, ListItemText, Typography, Chip, Box } from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import type { Transaction } from "../types";
import { formatDate, formatMoney } from "../utils/format";

interface Props {
  transactions: Transaction[];
}

const typeLabels: Record<string, string> = {
  CASH_IN: "Cash In",
  CASH_OUT: "Cash Out",
  SEND: "Transfer",
  RECEIVE: "Transfer",
  QR_PAYMENT: "QR Payment",
};

/**
 * `direction` comes from the server and is relative to the signed-in user: the
 * same SEND row is OUT for the sender and IN for the recipient. Deriving it from
 * `tx.type` showed recipients their incoming money as a red debit.
 */
function counterpartyLabel(tx: Transaction): string {
  if (!tx.counterparty) return typeLabels[tx.type] ?? tx.type.replace("_", " ");
  const who = tx.counterparty.name ?? tx.counterparty.maskedMobile;
  return tx.direction === "IN" ? `From ${who}` : `To ${who}`;
}

export default function TransactionList({ transactions }: Props) {
  if (!transactions.length) {
    return <Typography color="text.secondary" sx={{ textAlign: "center", py: 4 }}>No transactions yet</Typography>;
  }

  return (
    <List>
      {transactions.map((tx) => {
        const incoming = tx.direction === "IN";
        return (
          <ListItem key={tx.id} divider>
            <Box sx={{ mr: 2, display: "flex", color: incoming ? "success.main" : "error.main" }}>
              {incoming ? <ArrowDownwardIcon fontSize="small" /> : <ArrowUpwardIcon fontSize="small" />}
            </Box>
            <ListItemText
              primary={tx.description || counterpartyLabel(tx)}
              secondary={
                <>
                  {formatDate(tx.createdAt)}
                  {tx.reference && (
                    <Typography component="span" variant="caption" color="text.secondary" sx={{ display: "block" }}>
                      Ref {tx.reference}
                    </Typography>
                  )}
                </>
              }
            />
            <Box sx={{ textAlign: "right" }}>
              <Typography variant="body2" fontWeight="bold" color={incoming ? "success.main" : "error.main"}>
                {incoming ? "+" : "-"}{formatMoney(tx.amount.cents)}
              </Typography>
              <Chip
                label={typeLabels[tx.type] ?? tx.type.replace("_", " ")}
                size="small"
                color={incoming ? "success" : "error"}
                variant="outlined"
              />
            </Box>
          </ListItem>
        );
      })}
    </List>
  );
}
