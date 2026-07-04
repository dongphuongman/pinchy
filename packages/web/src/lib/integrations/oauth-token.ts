// Shared OAuth access-token expiry check used by every provider-specific OAuth
// module (google-oauth.ts, microsoft-oauth.ts, ...). Kept in one place so the
// refresh buffer stays consistent across providers.
export const EXPIRY_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 minutes before expiry

export function isTokenExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() - EXPIRY_BUFFER_MS < Date.now();
}

// Every provider parses its token response with a type assertion, not runtime
// validation, so a response missing expires_in reaches this call as undefined.
// Without this check, Date.now() + undefined * 1000 is NaN and
// new Date(NaN).toISOString() throws a RangeError deep inside the refresh
// path instead of a clear, attributable error at the boundary.
export function computeExpiresAt(expiresIn: number): string {
  if (typeof expiresIn !== "number" || !Number.isFinite(expiresIn) || expiresIn < 0) {
    throw new Error(`OAuth token response missing a valid expires_in: ${String(expiresIn)}`);
  }
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}
