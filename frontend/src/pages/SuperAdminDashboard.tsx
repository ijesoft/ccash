import { Box, Typography, Stack, Chip, Paper, Skeleton } from "@mui/material";
import { useQuery } from "@apollo/client";
import SupervisorAccountIcon from "@mui/icons-material/SupervisorAccount";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import PersonIcon from "@mui/icons-material/Person";
import StorefrontIcon from "@mui/icons-material/Storefront";
import { GET_ADMIN_STATS } from "../graphql/queries/admin";
import { formatMoney } from "../utils/format";

interface RoleCard {
  label: string;
  countLabel: string;
  balance: number;
  count: number;
  icon: React.ReactNode;
  color: string;
  bg: string;
}

export default function SuperAdminDashboard() {
  const { data, loading } = useQuery(GET_ADMIN_STATS, { pollInterval: 20000 });
  const stats = data?.platformStats;

  const roles: RoleCard[] = [
    { label: "Admins", countLabel: "admins", balance: stats?.adminBalanceCents ?? 0, count: stats?.adminCount ?? 0, icon: <AdminPanelSettingsIcon />, color: "#0f6ecd", bg: "#e3f0fc" },
    { label: "Members", countLabel: "members", balance: stats?.memberBalanceCents ?? 0, count: stats?.memberCount ?? 0, icon: <PersonIcon />, color: "#00b894", bg: "#e0faf3" },
    { label: "Merchants", countLabel: "merchants", balance: stats?.merchantBalanceCents ?? 0, count: stats?.merchantCount ?? 0, icon: <StorefrontIcon />, color: "#6c5ce7", bg: "#eee8ff" },
  ];

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5" fontWeight="bold">Dashboard</Typography>
        <Chip icon={<SupervisorAccountIcon />} label="SUPER ADMIN" color="error" variant="outlined" size="small" />
      </Stack>

      {loading || !stats ? (
        <Box>
          <Skeleton variant="rounded" height={140} sx={{ mb: 2, borderRadius: 3 }} />
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3, minmax(0, 1fr))" }, gap: 1.5 }}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} variant="rounded" height={120} sx={{ borderRadius: 3 }} />
            ))}
          </Box>
        </Box>
      ) : (
        <Box>
          <Paper
            elevation={0}
            sx={{
              p: { xs: 2.5, sm: 3 },
              mb: 2,
              borderRadius: 3,
              color: "white",
              background: "linear-gradient(135deg, #0f6ecd 0%, #084585 100%)",
            }}
          >
            <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
              <AccountBalanceWalletIcon fontSize="small" />
              <Typography variant="overline" sx={{ opacity: 0.85 }}>Total Wallet Balance · all users</Typography>
            </Stack>
            <Typography fontWeight={700} sx={{ fontFamily: '"League Spartan", sans-serif', fontSize: { xs: "2rem", sm: "2.5rem" }, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
              {formatMoney(stats.totalWalletBalanceCents)}
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.85, mt: 0.5 }}>
              {stats.activeWallets} active wallets · {stats.totalUsers} users
            </Typography>
          </Paper>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3, minmax(0, 1fr))" }, gap: 1.5 }}>
            {roles.map((role) => (
              <Paper key={role.label} elevation={0} sx={{ p: 2.5, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
                <Stack direction="row" alignItems="center" spacing={1.5} mb={1.5}>
                  <Box sx={{ width: 40, height: 40, borderRadius: 2.5, bgcolor: role.bg, color: role.color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {role.icon}
                  </Box>
                  <Typography variant="subtitle1" fontWeight={700}>{role.label}</Typography>
                </Stack>
                <Typography fontWeight={700} sx={{ fontFamily: '"League Spartan", sans-serif', fontSize: "1.5rem", letterSpacing: "-0.02em" }}>
                  {formatMoney(role.balance)}
                </Typography>
                <Typography variant="body2" color="text.secondary" mt={0.5}>
                  {role.count} {role.countLabel}
                </Typography>
              </Paper>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
