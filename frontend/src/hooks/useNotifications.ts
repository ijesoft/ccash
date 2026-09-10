import { useCallback } from "react";
import { useQuery } from "@apollo/client";
import { GET_NOTIFICATIONS, UNREAD_COUNT } from "../graphql/queries/wallet";
import type { NotificationConnection } from "../types";

export function useNotifications(limit = 20, offset = 0) {
  const {
    data,
    loading,
    refetch: refetchList,
  } = useQuery<{ notifications: NotificationConnection }>(GET_NOTIFICATIONS, {
    variables: { limit, offset },
    fetchPolicy: "cache-and-network",
  });

  const {
    data: unreadData,
    refetch: refetchUnread,
  } = useQuery<{ unreadCount: number }>(UNREAD_COUNT, {
    pollInterval: 20000,
    fetchPolicy: "cache-and-network",
  });

  const refetch = useCallback(async () => {
    await Promise.all([refetchList(), refetchUnread()]);
  }, [refetchList, refetchUnread]);

  return {
    notifications: data?.notifications ?? null,
    unreadCount: unreadData?.unreadCount ?? 0,
    loading,
    refetch,
    refetchList,
    refetchUnread,
  };
}
