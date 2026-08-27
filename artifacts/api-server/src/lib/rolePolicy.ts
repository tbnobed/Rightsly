export const USER_ROLES = ["admin", "content_admin", "legal", "finance", "sales"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export function isValidUserRole(role: unknown): role is UserRole {
  return typeof role === "string" && USER_ROLES.includes(role as UserRole);
}

export function roleHasPermission(role: string, allowedRoles: readonly string[]): boolean {
  return allowedRoles.includes(role)
    || (role === "content_admin" && allowedRoles.includes("admin"));
}

export function isStrictAdmin(role: string | null | undefined): boolean {
  return role === "admin";
}

export function canViewFinancials(role: string | null | undefined): boolean {
  return role === "admin" || role === "content_admin" || role === "finance";
}