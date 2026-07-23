import { useQuery } from "@apollo/client";
import { GET_NOTIFICATIONS, UNREAD_COUNT } from "../graphql/queries/wallet";
import type { NotificationConnection } from "../types";

export function useNotifications(limit = 20, offset = 0) {
  const { data, loading, refetch } = useQuery<{ notifications: NotificationConnection }>(
    GET_NOTIFICATIONS,
    { variables: { limit, offset } }
  );

  const { data: unreadData } = useQuery<{ unreadCount: number }>(UNREAD_COUNT, {
    pollInterval: 30000,
  });

  return {
    notifications: data?.notifications ?? null,
    unreadCount: unreadData?.unreadCount ?? 0,
    loading,
    refetch,
  };
}