export interface User {
  id: string;
  email: string;
  phone: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  kycLevel: string;
  role: string;
  is2faEnabled: boolean;
  isVerified: boolean;
  createdAt: string;
}

export interface Money {
  amount: number;
  cents: number;
  currency: string;
}

export interface Wallet {
  id: string;
  userId: string;
  balance: Money;
  status: string;
  dailySendLimit: Money;
  dailySendUsed: Money;
}

export type TransactionDirection = "IN" | "OUT";

export interface Counterparty {
  walletId: string;
  /** Null until the User model gains name fields; fall back to maskedMobile. */
  name: string | null;
  maskedMobile: string;
}

export interface Transaction {
  id: string;
  type: string;
  status: string;
  /**
   * Resolved by the server for the calling user. A SEND row is OUT for the
   * sender and IN for the recipient, so never derive the sign from `type`.
   */
  direction: TransactionDirection;
  counterparty: Counterparty | null;
  senderWalletId: string | null;
  receiverWalletId: string | null;
  amount: Money;
  fee: Money;
  netAmount: Money;
  reference: string | null;
  description: string | null;
  createdAt: string;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

export interface Favorite {
  id: string;
  name: string;
  accountIdentifier: string;
}

export interface AuthPayload {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface PaginationInfo {
  hasNext: boolean;
  hasPrevious: boolean;
  total: number;
}

export interface TransactionConnection {
  items: Transaction[];
  pagination: PaginationInfo;
}

export interface NotificationConnection {
  items: Notification[];
  pagination: PaginationInfo;
}