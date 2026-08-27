export function isAdminLike(role: string | null | undefined): boolean {
  return role === "admin" || role === "content_admin";
}

export function isStrictAdmin(role: string | null | undefined): boolean {
  return role === "admin";
}

export function canViewFinancials(role: string | null | undefined): boolean {
  return isAdminLike(role) || role === "finance";
}

export function roleLabel(role: string): string {
  if (role === "content_admin") return "Content Admin";
  return role.charAt(0).toUpperCase() + role.slice(1);
}