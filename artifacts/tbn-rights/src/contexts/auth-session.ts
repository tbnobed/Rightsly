export function isUnauthorizedAuthError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return "status" in error && error.status === 401;
}