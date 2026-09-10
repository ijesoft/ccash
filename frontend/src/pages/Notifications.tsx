import { useState } from "react";
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  Chip,
  Button,
  Alert,
  Paper,
  Badge,
} from "@mui/material";
import { useMutation } from "@apollo/client";
import { gql } from "@apollo/client";
import { useNotifications } from "../hooks/useNotifications";
import { GET_NOTIFICATIONS, UNREAD_COUNT } from "../graphql/queries/wallet";
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

const LIST_VARS = { limit: 20, offset: 0 };

export default function NotificationsPage() {
  const { notifications, unreadCount, loading, refetch } = useNotifications();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const [markRead] = useMutation(MARK_READ, {
    refetchQueries: [
      { query: GET_NOTIFICATIONS, variables: LIST_VARS },
      { query: UNREAD_COUNT },
    ],
    awaitRefetchQueries: true,
  });

  const [markAllRead] = useMutation(MARK_ALL_READ, {
    refetchQueries: [
      { query: GET_NOTIFICATIONS, variables: LIST_VARS },
      { query: UNREAD_COUNT },
    ],
    awaitRefetchQueries: true,
  });

  const handleMarkRead = async (id: string) => {
    if (busyId || markingAll) return;
    setBusyId(id);
    try {
      await markRead({
        variables: { id },
        optimisticResponse: { markNotificationRead: true },
        update(cache) {
          cache.updateQuery<{ unreadCount: number }>({ query: UNREAD_COUNT }, (data) => {
            if (!data) return data;
            return { unreadCount: Math.max(0, (data.unreadCount ?? 0) - 1) };
          });
          cache.updateQuery(
            { query: GET_NOTIFICATIONS, variables: LIST_VARS },
            (data: { notifications?: { items: Array<{ id: string; isRead: boolean }> } } | null) => {
              if (!data?.notifications) return data;
              return {
                ...data,
                notifications: {
                  ...data.notifications,
                  items: data.notifications.items.map((n) =>
                    n.id === id ? { ...n, isRead: true } : n,
                  ),
                },
              };
            },
          );
        },
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleMarkAllRead = async () => {
    if (markingAll || unreadCount === 0) return;
    setMarkingAll(true);
    try {
      await markAllRead({
        optimisticResponse: { markAllNotificationsRead: unreadCount },
        update(cache) {
          cache.writeQuery({ query: UNREAD_COUNT, data: { unreadCount: 0 } });
          cache.updateQuery(
            { query: GET_NOTIFICATIONS, variables: LIST_VARS },
            (data: { notifications?: { items: Array<{ isRead: boolean }> } } | null) => {
              if (!data?.notifications) return data;
              return {
                ...data,
                notifications: {
                  ...data.notifications,
                  items: data.notifications.items.map((n) => ({ ...n, isRead: true })),
                },
              };
            },
          );
        },
      });
      await refetch();
    } finally {
      setMarkingAll(false);
    }
  };

  if (loading && !notifications) return <Typography>Loading...</Typography>;

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
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
          <Typography
            fontWeight={700}
            sx={{ fontFamily: '"League Spartan", sans-serif', fontSize: { xs: "1.35rem", sm: "1.5rem" } }}
          >
            Notifications
          </Typography>
          <Badge
            color="error"
            badgeContent={unreadCount}
            max={99}
            invisible={unreadCount === 0}
            sx={{ "& .MuiBadge-badge": { position: "static", transform: "none" } }}
          />
        </Box>
        <Button
          onClick={handleMarkAllRead}
          variant="outlined"
          size="small"
          disabled={unreadCount === 0 || markingAll}
          sx={{ alignSelf: { xs: "stretch", sm: "auto" }, minHeight: 40 }}
        >
          {markingAll ? "Marking..." : "Mark All as Read"}
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
                bgcolor: notif.isRead ? "transparent" : "rgba(0, 184, 148, 0.08)",
                cursor: notif.isRead || busyId === notif.id ? "default" : "pointer",
                opacity: busyId === notif.id ? 0.7 : 1,
                alignItems: "flex-start",
                py: 1.75,
                px: { xs: 1.5, sm: 2 },
              }}
              onClick={() => !notif.isRead && handleMarkRead(notif.id)}
            >
              <ListItemText
                primary={
                  <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                    <Typography component="span" fontWeight={notif.isRead ? 500 : 700} sx={{ fontSize: "0.875rem" }}>
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
