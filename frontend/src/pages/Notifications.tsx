import { Box, Typography, List, ListItem, ListItemText, Chip, Button, Alert } from "@mui/material";
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
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 3 }}>
        <Typography variant="h5" fontWeight="bold">Notifications</Typography>
        <Button onClick={handleMarkAllRead}>Mark All Read</Button>
      </Box>

      {notifications && notifications.items.length === 0 && (
        <Alert severity="info">No notifications</Alert>
      )}

      <List>
        {notifications?.items.map((notif) => (
          <ListItem
            key={notif.id}
            divider
            sx={{ bgcolor: notif.isRead ? "transparent" : "action.hover", cursor: "pointer" }}
            onClick={() => !notif.isRead && handleMarkRead(notif.id)}
          >
            <ListItemText
              primary={
                <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                  {notif.title}
                  {!notif.isRead && <Chip label="New" size="small" color="primary" />}
                </Box>
              }
              secondary={
                <>
                  {notif.body}
                  <Typography variant="caption" display="block" color="text.secondary">{formatDate(notif.createdAt)}</Typography>
                </>
              }
            />
          </ListItem>
        ))}
      </List>
    </Box>
  );
}