import { db } from "@/db";
import { integrationConnections } from "@/db/schema";
import { eq } from "drizzle-orm";
import { encrypt } from "@/lib/encryption";
import { refreshAccessToken as refreshMsAccessToken } from "@/lib/integrations/microsoft-oauth";
import { getOAuthSettings } from "@/lib/integrations/oauth-settings";

export interface MicrosoftCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  scope?: string;
  [k: string]: unknown;
}

// Per-connectionId in-flight refresh tracker, shared by both providers. When
// an access token has expired and multiple plugin calls arrive concurrently,
// only the first caller runs `run()`; the rest await the same Promise and
// observe the same fresh token. Without this, every concurrent caller would
// burn a refresh against the provider with the same refresh_token, and
// refresh-token rotation means all but one fail with invalid_grant —
// corrupting the stored credential bundle. See issue #237. Each provider
// keeps its own Map (and Credentials type) since a connectionId's provider
// never changes at runtime, but the single-flight bookkeeping is identical.
function createRefreshDedup<T>() {
  const inFlight = new Map<string, Promise<T>>();
  return function dedupe(connectionId: string, run: () => Promise<T>): Promise<T> {
    const existing = inFlight.get(connectionId);
    if (existing) return existing;
    const promise = run().finally(() => inFlight.delete(connectionId));
    inFlight.set(connectionId, promise);
    return promise;
  };
}

// Thrown when a token refresh is actually required (the access token is
// expired) but the OAuth app settings needed to perform that refresh are
// missing — reachable since OAuth app settings have a lifecycle independent
// of connections (an admin can reset the OAuth app while connections still
// exist). Unlike a failed refresh attempt (network/provider error, where the
// stale credentials are a reasonable fallback), there is no credential to
// fall back to here that will actually work — the plugin would cache a token
// doomed to fail on first use. The route surfaces this as a loud 5xx rather
// than silently returning expired credentials with a 200.
export class OAuthSettingsMissingError extends Error {
  constructor(readonly provider: string) {
    super(`${provider} OAuth settings not configured`);
    this.name = "OAuthSettingsMissingError";
  }
}

const dedupeMicrosoftRefresh = createRefreshDedup<MicrosoftCredentials>();

async function persistMicrosoftCredentials(
  connectionId: string,
  updated: MicrosoftCredentials
): Promise<void> {
  await db
    .update(integrationConnections)
    .set({
      credentials: encrypt(JSON.stringify(updated)),
      updatedAt: new Date(),
    })
    .where(eq(integrationConnections.id, connectionId));
}

export async function refreshMicrosoftCredentials(
  connectionId: string,
  current: MicrosoftCredentials
): Promise<MicrosoftCredentials> {
  return dedupeMicrosoftRefresh(connectionId, async () => {
    let updated: MicrosoftCredentials;
    try {
      const oauthSettings = await getOAuthSettings("microsoft");
      if (!oauthSettings) {
        console.error("Microsoft OAuth token refresh failed: OAuth settings not configured");
        throw new OAuthSettingsMissingError("Microsoft");
      }

      const refreshed = await refreshMsAccessToken({
        tenantId: (oauthSettings as { tenantId?: string }).tenantId ?? "",
        refreshToken: current.refreshToken,
        clientId: oauthSettings.clientId,
        clientSecret: oauthSettings.clientSecret,
      });

      // Critical: Microsoft rotates the refresh token on every use.
      // Unlike Google (which only returns a new accessToken), we MUST
      // persist BOTH the new accessToken AND the new refreshToken.
      updated = {
        ...current,
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        expiresAt: refreshed.expiresAt,
      };
    } catch (err) {
      if (err instanceof OAuthSettingsMissingError) {
        // Re-throw: there is no safe stale fallback when settings are missing
        // and a refresh is required (see class comment above).
        throw err;
      }
      // Provider call failed (network/provider error). The old refresh
      // token was never used, so it is still valid — stale credentials are
      // a safe, reasonable fallback here.
      console.error("Microsoft OAuth token refresh failed:", err);
      return current;
    }

    // From here on, the provider call already succeeded and rotated the
    // refresh token server-side — the OLD refreshToken (`current`) is now
    // dead at Microsoft. A persist failure past this point must NEVER fall
    // back to `current`: doing so would silently discard the only copy of
    // the newly rotated refresh token, leaving the DB holding a token
    // Microsoft has already invalidated. Every subsequent refresh would then
    // fail with invalid_grant, permanently bricking the mailbox until a
    // manual reconnect. So we retry the persist once, and if that also
    // fails, we fail loudly (re-throw) instead of returning anything.
    try {
      await persistMicrosoftCredentials(connectionId, updated);
    } catch (firstErr) {
      console.error("Microsoft OAuth token DB persist failed, retrying once:", firstErr);
      try {
        await persistMicrosoftCredentials(connectionId, updated);
      } catch (retryErr) {
        console.error(
          `CRITICAL: failed to persist rotated Microsoft refresh token for connection ${connectionId} ` +
            "after retry. The provider has already rotated this token, so the previous " +
            "refresh token is now invalid and returning stale credentials would silently " +
            "burn this connection (invalid_grant loop). Manual reconnect will be required " +
            "unless this is resolved.",
          retryErr
        );
        throw retryErr;
      }
    }

    console.log("Refreshed Microsoft OAuth token for connection", connectionId);
    return updated;
  });
}
