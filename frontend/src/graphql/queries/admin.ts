import { gql } from "@apollo/client";

export const GET_ADMIN_STATS = gql`
  query PlatformStats {
    platformStats {
      totalUsers
      activeWallets
      totalTransactions
      transactionVolumeCents
    }
  }
`;

export const GET_ADMIN_MEMBERS = gql`
  query AdminMembers($limit: Int, $offset: Int) {
    adminUsers(limit: $limit, offset: $offset) {
      id
      email
      role
      status
      walletBalanceCents
      walletStatus
      createdAt
    }
  }
`;