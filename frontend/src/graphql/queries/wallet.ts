import { gql } from "@apollo/client";

export const GET_WALLET = gql`
  query Wallet {
    wallet {
      id
      balance { amount cents currency }
      status
      dailySendLimit { cents }
      dailySendUsed { cents }
    }
  }
`;

export const GET_TRANSACTIONS = gql`
  query Transactions($limit: Int, $offset: Int, $txType: String, $status: String) {
    transactions(limit: $limit, offset: $offset, txType: $txType, status: $status) {
      items {
        id
        type
        status
        direction
        counterparty { walletId name maskedMobile }
        amount { cents }
        fee { cents }
        reference
        description
        createdAt
      }
      pagination { hasNext hasPrevious total }
    }
  }
`;

export const GET_NOTIFICATIONS = gql`
  query Notifications($limit: Int, $offset: Int) {
    notifications(limit: $limit, offset: $offset) {
      items {
        id
        type
        title
        body
        isRead
        createdAt
      }
      pagination { hasNext hasPrevious total }
    }
  }
`;

export const GET_FAVORITES = gql`
  query Favorites {
    favorites {
      id
      name
      accountIdentifier
    }
  }
`;

export const UNREAD_COUNT = gql`
  query UnreadCount {
    unreadCount
  }
`;