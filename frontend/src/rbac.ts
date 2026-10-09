export type Role = "MEMBER" | "MERCHANT" | "ADMIN" | "SUPER_ADMIN" | "AUDITOR";

export const PERMISSIONS = {
  PLATFORM_STATS: "platform:stats",
  USERS_READ: "users:read",
  USERS_CREATE: "users:create",
  USERS_UPDATE: "users:update",
  USERS_SUSPEND: "users:suspend",
  USERS_DELETE: "users:delete",
  USERS_RESET_PASSWORD: "users:reset-password",
  USERS_CHANGE_ROLE: "users:change-role",
  USERS_SET_ID: "users:set-id",
  MERCHANTS_READ: "merchants:read",
  MERCHANTS_UPDATE: "merchants:update",
  MERCHANTS_SET_ID: "merchants:set-id",
  TX_READ_ALL: "transactions:read-all",
  CASH_OPERATE: "cash:operate",
  REPORTS_EXPORT: "reports:export",
  MASTERLIST_READ: "masterlist:read",
  MASTERLIST_WRITE: "masterlist:write",
  BRANDING_WRITE: "branding:write",
  KYC_REVIEW: "kyc:review",
  AUDIT_READ: "audit:read",
  AUDIT_EXPORT: "audit:export",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const ALL = Object.values(PERMISSIONS) as Permission[];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  MEMBER: [],
  MERCHANT: [],
  ADMIN: [...ALL],
  SUPER_ADMIN: [...ALL],
  AUDITOR: [
    PERMISSIONS.PLATFORM_STATS,
    PERMISSIONS.USERS_READ,
    PERMISSIONS.MERCHANTS_READ,
    PERMISSIONS.TX_READ_ALL,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.AUDIT_EXPORT,
  ],
};

export function hasPermission(role: string | null | undefined, perm: Permission): boolean {
  if (!role) return false;
  return (ROLE_PERMISSIONS[role as Role] ?? []).includes(perm);
}

export function hasRole(role: string | null | undefined, ...wants: Role[]): boolean {
  if (!role) return false;
  return wants.includes(role as Role);
}

export function isSuperAdmin(role: string | null | undefined): boolean {
  return role === "SUPER_ADMIN";
}
