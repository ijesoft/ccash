import { List, ListItem, ListItemText, Typography, Chip, Box, Divider, Avatar, Tooltip } from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import type { Transaction } from "../types";
import { formatDate, formatMoney } from "../utils/format";

interface Props {
  transactions: Transaction[];
}

const typeLabels: Record<string, string> = {
  CASH_IN: "Cash In",
  CASH_OUT: "Cash Out",
  SEND: "Transfer",
  QR_PAYMENT: "QR Payment",
};

function counterpartyLabel(tx: Transaction): string {
  if (!tx.counterparty) return typeLabels[tx.type] ?? tx.type.replace("_", " ");
  const who = tx.counterparty.name ?? tx.counterparty.maskedMobile;
  return tx.direction === "IN" ? `From ${who}` : `To ${who}`;
}

export default function TransactionList({ transactions }: Props) {
  if (!transactions.length) {
    return (
      <Box sx={{ textAlign: "center", py: 4 }}>
        <AccountBalanceWalletIcon sx={{ fontSize: 40, color: "text.disabled", mb: 1 }} />
        <Typography variant="body2" color="text.secondary">No transactions yet</Typography>
      </Box>
    );
  }

  return (
    <List sx={{ p: 0 }}>
      {transactions.map((tx, index) => {
        const incoming = tx.direction === "IN";
        return (
          <Box key={tx.id}>
            {index > 0 && <Divider variant="inset" component="li" />}
            <ListItem
              sx={{
                py: 2,
                px: 2,
                borderRadius: 2,
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              <Avatar
                sx={{
                  bgcolor: incoming ? "success.light" : "background.default",
                  color: incoming ? "success.main" : "text.secondary",
                  mr: 2,
                  width: 40,
                  height: 40,
                }}
              >
                {incoming ? <ArrowDownwardIcon fontSize="small" /> : <ArrowUpwardIcon fontSize="small" />}
              </Avatar>
              <ListItemText
                primary={
                  <Typography variant="body2" fontWeight={500}>
                    {tx.description || counterpartyLabel(tx)}
                  </Typography>
                }
                secondary={
                  <>
                    <Typography variant="caption" color="text.secondary" component="span">
                      {formatDate(tx.createdAt)}
                    </Typography>
                    {tx.reference && (
                      <Tooltip title={tx.reference}>
                        <Typography component="span" variant="caption" color="text.secondary" sx={{ display: "block", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          Ref {tx.reference}
                        </Typography>
                      </Tooltip>
                    )}
                  </>
                }
              />
              <Box sx={{ textAlign: "right", minWidth: 80 }}>
                <Typography variant="body2" fontWeight={600} sx={{ color: incoming ? "success.main" : "text.primary" }}>
                  {incoming ? "+" : "-"}
                  {formatMoney(tx.amount.cents)}
                </Typography>
                <Chip
                  label={typeLabels[tx.type] ?? tx.type.replace("_", " ")}
                  size="small"
                  variant="outlined"
                  sx={{ mt: 0.5, borderRadius: 1.5, fontSize: "0.625rem", height: 22 }}
                />
              </Box>
            </ListItem>
          </Box>
        );
      })}
    </List>
  );
}