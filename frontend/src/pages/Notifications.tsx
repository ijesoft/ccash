import { Box, Typography, List, ListItem, ListItemText, Chip, Button, Alert, Paper } from "@mui/material";
import { useMutation } from "@apollo/client";
import { gql } from "@apollo/client";
import { useNotifications } from "../hooks/useNotifications";
import { formatDate } from "../utils/format";

const MARK_READ = gql`
  mutation MarkNotificationRead($id: String!) {
    markNotificationRead(id: $id)
  }
`;

const MARK_ALL_READ = gql`
  mutation MarkAllNotificationsRead {
    markAllNotificationsRead
  }
`;

export default function NotificationsPage() {
  const { notifications, loading, refetch } = useNotifications();
  const [markRead] = useMutation(MARK_READ);
  const [markAllRead] = useMutation(MARK_ALL_READ);

  const handleMarkRead = async (id: string) => {
    await markRead({ variables: { id } });
    refetch();
  };

  const handleMarkAllRead = async () => {
    await markAllRead();
    refetch();
  };

  if (loading) return <Typography>Loading...</Typography>;

  return (
    <Box className="animate-fade-in">
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          justifyContent: "space-between",
          alignItems: { xs: "stretch", sm: "center" },
          gap: 1.5,
          mb: 2.5,
        }}
      >
        <Typography
          fontWeight={700}
          sx={{ fontFamily: '"League Spartan", sans-serif', fontSize: { xs: "1.35rem", sm: "1.5rem" } }}
        >
          Notifications
        </Typography>
        <Button onClick={handleMarkAllRead} variant="outlined" size="small" sx={{ alignSelf: { xs: "stretch", sm: "auto" }, minHeight: 40 }}>
          Mark All Read
        </Button>
      </Box>

      {notifications && notifications.items.length === 0 && (
        <Alert severity="info" sx={{ borderRadius: 2 }}>No notifications</Alert>
      )}

      <Paper elevation={0} sx={{ borderRadius: 3, border: "1px solid", borderColor: "divider", overflow: "hidden" }}>
        <List sx={{ p: 0 }}>
          {notifications?.items.map((notif) => (
            <ListItem
              key={notif.id}
              divider
              sx={{
                bgcolor: notif.isRead ? "transparent" : "primary.light",
                cursor: notif.isRead ? "default" : "pointer",
                alignItems: "flex-start",
                py: 1.75,
                px: { xs: 1.5, sm: 2 },
              }}
              onClick={() => !notif.isRead && handleMarkRead(notif.id)}
            >
              <ListItemText
                primary={
                  <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                    <Typography component="span" fontWeight={600} sx={{ fontSize: "0.875rem" }}>
                      {notif.title}
                    </Typography>
                    {!notif.isRead && <Chip label="New" size="small" color="primary" sx={{ height: 22 }} />}
                  </Box>
                }
                secondary={
                  <>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontSize: "0.8rem" }}>
                      {notif.body}
                    </Typography>
                    <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
                      {formatDate(notif.createdAt)}
                    </Typography>
                  </>
                }
              />
            </ListItem>
          ))}
        </List>
      </Paper>
    </Box>
  );
}
