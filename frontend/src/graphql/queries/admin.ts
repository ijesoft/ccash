import { gql } from "@apollo/client";

export const GET_ADMIN_STATS = gql`
  query PlatformStats {
    platformStats {
      totalUsers
      activeWallets
      totalTransactions
      transactionVolumeCents
      totalWalletBalanceCents
    }
  }
`;

export const GET_ADMIN_MEMBERS = gql`
  query AdminMembers($limit: Int, $offset: Int, $role: UserRoleEnum) {
    adminUsers(limit: $limit, offset: $offset, role: $role) {
      id
      email
      idNo
      firstName
      middleName
      lastName
      role
      status
      walletBalanceCents
      walletStatus
      createdAt
    }
  }
`;

export const GET_ADMIN_MERCHANTS = gql`
  query AdminMerchants($limit: Int, $offset: Int) {
    adminMerchants(limit: $limit, offset: $offset) {
      id
      merchantIdNo
      companyName
      contactPerson
      mobileNo
      landline
      address
      tin
      email
      status
      createdAt
    }
  }
`;

export const ADMIN_CREATE_MEMBER = gql`
  mutation AdminCreateMember($input: AdminCreateMemberInput!) {
    adminCreateMember(input: $input) {
      temporaryPassword
      user {
        id
        email
        idNo
        firstName
        lastName
      }
    }
  }
`;

export const GET_ADMIN_USER_TRANSACTIONS = gql`
  query AdminUserTransactions($userId: String!, $limit: Int, $offset: Int) {
    adminUserTransactions(userId: $userId, limit: $limit, offset: $offset) {
      id
      type
      status
      direction
      counterparty { name maskedMobile }
      amount { cents }
      reference
      description
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

export const ADMIN_SET_MEMBER_ID = gql`
  mutation AdminSetMemberId($userId: String!, $idNo: String!) {
    adminSetMemberId(userId: $userId, idNo: $idNo) {
      id
      idNo
    }
  }
`;

export const ADMIN_SET_MERCHANT_ID = gql`
  mutation AdminSetMerchantId($userId: String!, $merchantIdNo: String!) {
    adminSetMerchantId(userId: $userId, merchantIdNo: $merchantIdNo) {
      merchantIdNo
    }
  }
`;

export const ADMIN_RESET_PASSWORD = gql`
  mutation AdminResetPassword($userId: String!) {
    adminResetPassword(userId: $userId) {
      temporaryPassword
      user {
        id
        email
      }
    }
  }
`;

export const GET_ADMIN_ACCOUNT_DETAIL = gql`
  query AdminAccountDetail($userId: String!) {
    adminAccountDetail(userId: $userId) {
      id
      email
      phone
      idNo
      firstName
      middleName
      lastName
      role
      status
      kycLevel
      createdAt
      walletBalanceCents
      walletStatus
      merchant {
        merchantIdNo
        companyName
        contactPerson
        mobileNo
        landline
        address
        tin
      }
    }
  }
`;

export const ADMIN_UPDATE_MEMBER_PROFILE = gql`
  mutation AdminUpdateMemberProfile($userId: String!, $input: AdminUpdateMemberProfileInput!) {
    adminUpdateMemberProfile(userId: $userId, input: $input) {
      id
      email
      phone
      firstName
      middleName
      lastName
    }
  }
`;

export const ADMIN_UPDATE_MERCHANT_PROFILE = gql`
  mutation AdminUpdateMerchantProfile($userId: String!, $input: AdminUpdateMerchantProfileInput!) {
    adminUpdateMerchantProfile(userId: $userId, input: $input) {
      merchantIdNo
      companyName
      contactPerson
      mobileNo
      landline
      address
      tin
    }
  }
`;

export const ADMIN_DELETE_ACCOUNT = gql`
  mutation AdminDeleteAccount($userId: String!) {
    adminDeleteAccount(userId: $userId)
  }
`;