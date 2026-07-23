import { useState } from "react";
import { Card, CardContent, Typography, IconButton, Box } from "@mui/material";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import { formatMoney } from "../utils/format";

interface Props {
  balanceCents: number;
  dailyLimitCents?: number;
  dailyUsedCents?: number;
}

export default function BalanceCard({ balanceCents, dailyLimitCents, dailyUsedCents }: Props) {
  const [showBalance, setShowBalance] = useState(true);

  return (
    <Card sx={{ mb: 3, background: "linear-gradient(135deg, #0f6ecd 0%, #00b894 100%)", color: "white" }}>
      <CardContent>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Typography variant="subtitle2">Available Balance</Typography>
          <IconButton size="small" onClick={() => setShowBalance(!showBalance)} sx={{ color: "white" }}>
            {showBalance ? <VisibilityOffIcon /> : <VisibilityIcon />}
          </IconButton>
        </Box>
        <Typography variant="h4" fontWeight="bold" sx={{ my: 1 }}>
          {showBalance ? formatMoney(balanceCents) : "••••••"}
        </Typography>
        {dailyLimitCents && dailyUsedCents !== undefined && (
          <Typography variant="caption">
            Daily limit: {formatMoney(dailyUsedCents)} / {formatMoney(dailyLimitCents)}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}