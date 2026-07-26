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
            {index > 0 && <Divider component="li" />}
            <ListItem
              sx={{
                py: { xs: 1.5, sm: 2 },
                px: { xs: 1.5, sm: 2 },
                alignItems: "flex-start",
                gap: { xs: 1, sm: 0 },
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              <Avatar
                sx={{
                  bgcolor: incoming ? "success.light" : "grey.100",
                  color: incoming ? "success.main" : "text.secondary",
                  mr: { xs: 1, sm: 2 },
                  width: { xs: 36, sm: 40 },
                  height: { xs: 36, sm: 40 },
                  mt: 0.25,
                  flexShrink: 0,
                }}
              >
                {incoming ? <ArrowDownwardIcon fontSize="small" /> : <ArrowUpwardIcon fontSize="small" />}
              </Avatar>
              <ListItemText
                sx={{ m: 0, minWidth: 0, pr: 1 }}
                primary={
                  <Typography
                    variant="body2"
                    fontWeight={600}
                    noWrap
                    sx={{ fontSize: { xs: "0.8rem", sm: "0.875rem" } }}
                  >
                    {tx.description || counterpartyLabel(tx)}
                  </Typography>
                }
                secondary={
                  <Box component="span" sx={{ display: "block", mt: 0.25 }}>
                    <Typography variant="caption" color="text.secondary" component="span" display="block">
                      {formatDate(tx.createdAt)}
                    </Typography>
                    {tx.reference && (
                      <Tooltip title={tx.reference}>
                        <Typography
                          component="span"
                          variant="caption"
                          color="text.secondary"
                          sx={{
                            display: { xs: "none", sm: "block" },
                            maxWidth: 140,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Ref {tx.reference}
                        </Typography>
                      </Tooltip>
                    )}
                  </Box>
                }
              />
              <Box sx={{ textAlign: "right", flexShrink: 0, minWidth: { xs: 72, sm: 88 } }}>
                <Typography
                  variant="body2"
                  fontWeight={700}
                  sx={{
                    color: incoming ? "success.main" : "text.primary",
                    fontSize: { xs: "0.8rem", sm: "0.875rem" },
                    whiteSpace: "nowrap",
                  }}
                >
                  {incoming ? "+" : "−"}
                  {formatMoney(tx.amount.cents)}
                </Typography>
                <Chip
                  label={typeLabels[tx.type] ?? tx.type.replace("_", " ")}
                  size="small"
                  variant="outlined"
                  sx={{
                    mt: 0.5,
                    borderRadius: 1.5,
                    fontSize: "0.6rem",
                    height: 20,
                    display: { xs: "none", sm: "inline-flex" },
                  }}
                />
              </Box>
            </ListItem>
          </Box>
        );
      })}
    </List>
  );
}
