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

// Per-connectionId in-flight refresh tracker shared by every OAuth provider's
// refresh path (Google, Microsoft, ...). When an access token has expired and
// multiple plugin calls arrive concurrently, only the first caller runs
// `run()`; the rest await the same Promise and observe the same fresh token.
// Without this, every concurrent caller would burn a refresh against the
// provider with the same refresh_token, and refresh-token rotation means all
// but one fail with invalid_grant — corrupting the stored credential bundle.
// See issue #237. Each provider keeps its own Map (and Credentials type)
// since a connectionId's provider never changes at runtime, but the
// single-flight bookkeeping is identical, hence sharing this factory.
export function createRefreshDedup<T>() {
  const inFlight = new Map<string, Promise<T>>();
  return function dedupe(connectionId: string, run: () => Promise<T>): Promise<T> {
    const existing = inFlight.get(connectionId);
    if (existing) return existing;
    const promise = run().finally(() => inFlight.delete(connectionId));
    inFlight.set(connectionId, promise);
    return promise;
  };
}
