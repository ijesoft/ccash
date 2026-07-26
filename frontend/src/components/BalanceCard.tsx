import { useState } from "react";
import { Card, CardContent, Typography, IconButton, Box } from "@mui/material";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import { formatMoney } from "../utils/format";

interface Props {
  balanceCents: number;
  dailyLimitCents?: number;
  dailyUsedCents?: number;
}

export default function BalanceCard({ balanceCents, dailyLimitCents, dailyUsedCents }: Props) {
  const [showBalance, setShowBalance] = useState(true);

  return (
    <Card
      sx={{
        mb: 3,
        background: "linear-gradient(135deg, #0f6ecd 0%, #084585 100%)",
        color: "white",
        borderRadius: 3,
        overflow: "hidden",
      }}
    >
      <CardContent sx={{ position: "relative" }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
          <Typography variant="subtitle2" sx={{ opacity: 0.9 }}>
            Available Balance
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <TrendingUpIcon sx={{ fontSize: 16, opacity: 0.8 }} />
            <IconButton
              size="small"
              onClick={() => setShowBalance(!showBalance)}
              sx={{ color: "white", p: 0.5, minWidth: 32, minHeight: 32 }}
            >
              {showBalance ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
            </IconButton>
          </Box>
        </Box>
        <Typography
          variant="h3"
          fontWeight={700}
          sx={{ fontFamily: '"League Spartan", sans-serif', my: 1, letterSpacing: "-0.02em" }}
        >
          {showBalance ? formatMoney(balanceCents) : "••••••"}
        </Typography>
        {dailyLimitCents && dailyUsedCents !== undefined && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" sx={{ opacity: 0.8 }}>
              Daily limit: {formatMoney(dailyUsedCents)} / {formatMoney(dailyLimitCents)}
            </Typography>
            <Box
              sx={{
                mt: 1,
                height: 4,
                bgcolor: "rgba(255,255,255,0.2)",
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              <Box
                sx={{
                  width: `${Math.min((dailyUsedCents / dailyLimitCents) * 100, 100)}%`,
                  height: "100%",
                  bgcolor: dailyUsedCents / dailyLimitCents > 0.8 ? "#f39c12" : "white",
                  borderRadius: 2,
                  transition: "width 0.3s ease",
                }}
              />
            </Box>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}