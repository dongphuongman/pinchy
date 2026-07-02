import { describe, it, expect } from "vitest";
import { EXPIRY_BUFFER_MS, isTokenExpired } from "@/lib/integrations/oauth-token";

describe("oauth-token", () => {
  describe("EXPIRY_BUFFER_MS", () => {
    it("is 5 minutes in milliseconds", () => {
      expect(EXPIRY_BUFFER_MS).toBe(5 * 60 * 1000);
    });
  });

  describe("isTokenExpired", () => {
    it("returns true if expiresAt is in the past", () => {
      const pastDate = new Date(Date.now() - 60_000).toISOString();
      expect(isTokenExpired(pastDate)).toBe(true);
    });

    it("returns false if expiresAt is exactly at the 5-minute buffer boundary", () => {
      // expiresAt - EXPIRY_BUFFER_MS < now is a strict inequality, so the exact
      // boundary (expiresAt - buffer === now) is not yet considered expired.
      const boundaryDate = new Date(Date.now() + EXPIRY_BUFFER_MS).toISOString();
      expect(isTokenExpired(boundaryDate)).toBe(false);
    });

    it("returns true if expiresAt is within the 5-minute buffer", () => {
      const soonDate = new Date(Date.now() + 2 * 60_000).toISOString();
      expect(isTokenExpired(soonDate)).toBe(true);
    });

    it("returns false if expiresAt is just past the 5-minute buffer", () => {
      const justOutsideBuffer = new Date(Date.now() + EXPIRY_BUFFER_MS + 60_000).toISOString();
      expect(isTokenExpired(justOutsideBuffer)).toBe(false);
    });

    it("returns false if expiresAt is well in the future", () => {
      const futureDate = new Date(Date.now() + 30 * 60_000).toISOString();
      expect(isTokenExpired(futureDate)).toBe(false);
    });
  });
});
