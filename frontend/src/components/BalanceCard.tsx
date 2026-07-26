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
    <Card
      className="animate-scale-in"
      sx={{
        mb: { xs: 2, sm: 3 },
        background: "linear-gradient(145deg, #0f6ecd 0%, #0b57a8 45%, #084585 100%)",
        color: "white",
        borderRadius: { xs: 3, sm: 4 },
        overflow: "hidden",
        position: "relative",
        border: "none",
        boxShadow: "0 12px 28px rgba(15, 110, 205, 0.28)",
        "&::after": {
          content: '""',
          position: "absolute",
          width: 180,
          height: 180,
          borderRadius: "50%",
          bgcolor: "rgba(255,255,255,0.08)",
          top: -60,
          right: -40,
        },
      }}
    >
      <CardContent sx={{ position: "relative", zIndex: 1, p: { xs: 2.5, sm: 3 }, "&:last-child": { pb: { xs: 2.5, sm: 3 } } }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
          <Typography variant="overline" sx={{ opacity: 0.85, letterSpacing: "0.1em", color: "inherit" }}>
            Available Balance
          </Typography>
          <IconButton
            size="small"
            onClick={() => setShowBalance(!showBalance)}
            aria-label={showBalance ? "Hide balance" : "Show balance"}
            sx={{ color: "white", p: 0.75, minWidth: 40, minHeight: 40, bgcolor: "rgba(255,255,255,0.12)" }}
          >
            {showBalance ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
          </IconButton>
        </Box>
        <Typography
          fontWeight={700}
          sx={{
            fontFamily: '"League Spartan", sans-serif',
            my: 0.5,
            letterSpacing: "-0.03em",
            fontSize: { xs: "2rem", sm: "2.5rem", md: "2.75rem" },
            lineHeight: 1.1,
            wordBreak: "break-word",
          }}
        >
          {showBalance ? formatMoney(balanceCents) : "••••••"}
        </Typography>
        {dailyLimitCents != null && dailyUsedCents !== undefined && (
          <Box sx={{ mt: 2.5 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, mb: 0.75 }}>
              <Typography variant="caption" sx={{ opacity: 0.85 }}>
                Daily send limit
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.95, fontWeight: 600 }}>
                {formatMoney(dailyUsedCents)} / {formatMoney(dailyLimitCents)}
              </Typography>
            </Box>
            <Box
              sx={{
                height: 5,
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
