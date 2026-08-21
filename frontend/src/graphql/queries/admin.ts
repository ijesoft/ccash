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

export const ACTIVATE_USER = gql`
  mutation ActivateUser($userId: String!) {
    activateUser(userId: $userId) {
      id
      email
      status
    }
  }
`;

export const SUSPEND_USER = gql`
  mutation SuspendUser($userId: String!) {
    suspendUser(userId: $userId) {
      id
      email
      status
    }
  }
`;

export const UPDATE_USER_ROLE = gql`
  mutation UpdateUserRole($userId: String!, $role: UserRoleEnum!) {
    updateUserRole(userId: $userId, role: $role) {
      id
      email
      role
    }
  }
`;