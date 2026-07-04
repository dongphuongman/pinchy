import { describe, it, expect } from "vitest";
import {
  saveOAuthSchema,
  saveGoogleOAuthSchema,
  saveMicrosoftOAuthSchema,
} from "@/lib/schemas/oauth-settings";

describe("oauth-settings schemas", () => {
  describe("saveGoogleOAuthSchema", () => {
    it("accepts a clientId with no clientSecret (secret omitted = keep current)", () => {
      const parsed = saveGoogleOAuthSchema.parse({
        provider: "google",
        clientId: "client-id",
      });
      expect(parsed).toEqual({ provider: "google", clientId: "client-id" });
    });

    it("accepts a clientId with a clientSecret", () => {
      const parsed = saveGoogleOAuthSchema.parse({
        provider: "google",
        clientId: "client-id",
        clientSecret: "secret",
      });
      expect(parsed.clientSecret).toBe("secret");
    });

    it("rejects a missing clientId", () => {
      expect(() => saveGoogleOAuthSchema.parse({ provider: "google" })).toThrow();
    });

    it("rejects an empty clientId", () => {
      expect(() => saveGoogleOAuthSchema.parse({ provider: "google", clientId: "" })).toThrow();
    });

    it("rejects an explicitly empty clientSecret", () => {
      expect(() =>
        saveGoogleOAuthSchema.parse({
          provider: "google",
          clientId: "client-id",
          clientSecret: "",
        })
      ).toThrow();
    });

    it("has no tenantId field — Google is not tenant-scoped", () => {
      // A tenantId sent for Google is simply not part of this schema's shape;
      // discriminatedUnion routes it here based on `provider`, and zod strips
      // unknown keys by default rather than rejecting them.
      const parsed = saveGoogleOAuthSchema.parse({
        provider: "google",
        clientId: "client-id",
        tenantId: "should-be-ignored",
      });
      expect(parsed).not.toHaveProperty("tenantId");
    });
  });

  describe("saveMicrosoftOAuthSchema", () => {
    it("accepts a clientId with no clientSecret and no tenantId", () => {
      const parsed = saveMicrosoftOAuthSchema.parse({
        provider: "microsoft",
        clientId: "client-id",
      });
      expect(parsed).toEqual({ provider: "microsoft", clientId: "client-id" });
    });

    it("accepts an optional tenantId", () => {
      const parsed = saveMicrosoftOAuthSchema.parse({
        provider: "microsoft",
        clientId: "client-id",
        clientSecret: "secret",
        tenantId: "tenant-id",
      });
      expect(parsed.tenantId).toBe("tenant-id");
    });

    it("rejects an explicitly empty tenantId", () => {
      expect(() =>
        saveMicrosoftOAuthSchema.parse({
          provider: "microsoft",
          clientId: "client-id",
          tenantId: "",
        })
      ).toThrow();
    });

    it("rejects an explicitly empty clientSecret", () => {
      expect(() =>
        saveMicrosoftOAuthSchema.parse({
          provider: "microsoft",
          clientId: "client-id",
          clientSecret: "",
        })
      ).toThrow();
    });
  });

  describe("saveOAuthSchema (discriminated union)", () => {
    it("routes a google-shaped body through the google branch", () => {
      const parsed = saveOAuthSchema.parse({
        provider: "google",
        clientId: "client-id",
        clientSecret: "secret",
      });
      expect(parsed.provider).toBe("google");
    });

    it("routes a microsoft-shaped body through the microsoft branch", () => {
      const parsed = saveOAuthSchema.parse({
        provider: "microsoft",
        clientId: "client-id",
        tenantId: "tenant-id",
      });
      expect(parsed.provider).toBe("microsoft");
      if (parsed.provider === "microsoft") {
        expect(parsed.tenantId).toBe("tenant-id");
      }
    });

    it("rejects an unsupported provider discriminant", () => {
      expect(() => saveOAuthSchema.parse({ provider: "github", clientId: "client-id" })).toThrow();
    });

    it("rejects a body missing the provider discriminant", () => {
      expect(() => saveOAuthSchema.parse({ clientId: "client-id" })).toThrow();
    });
  });
});
