import { Box, Typography, Card, CardContent, Grid, Alert } from "@mui/material";

export default function AdminDashboard() {
  return (
    <Box>
      <Typography variant="h5" fontWeight="bold" mb={3}>Admin Dashboard</Typography>

      <Grid container spacing={3} mb={3}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card>
            <CardContent>
              <Typography variant="h4" fontWeight="bold">--</Typography>
              <Typography variant="body2" color="text.secondary">Total Users</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card>
            <CardContent>
              <Typography variant="h4" fontWeight="bold">--</Typography>
              <Typography variant="body2" color="text.secondary">Active Wallets</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card>
            <CardContent>
              <Typography variant="h4" fontWeight="bold">--</Typography>
              <Typography variant="body2" color="text.secondary">Total Transactions</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card>
            <CardContent>
              <Typography variant="h4" fontWeight="bold">--</Typography>
              <Typography variant="body2" color="text.secondary">Transaction Volume</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Alert severity="info">Admin functionality requires ADMIN role permissions.</Alert>
    </Box>
  );
}