// Shared OAuth access-token expiry check used by every provider-specific OAuth
// module (google-oauth.ts, microsoft-oauth.ts, ...). Kept in one place so the
// refresh buffer stays consistent across providers.
export const EXPIRY_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 minutes before expiry

export function isTokenExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() - EXPIRY_BUFFER_MS < Date.now();
}
