// Pre-flight validation of Microsoft OAuth app config, run at "save settings"
// time so a misconfiguration surfaces as an inline field error instead of a
// dead-end on Microsoft's own error page. AADSTS90002 (tenant not found) is a
// pre-authorize error that never redirects back to our callback, so it can
// only be PREVENTED here, not caught later. See docs/plans/2026-07-03-oauth-
// lifecycle-hardening.md.
const WELL_KNOWN_TENANTS = new Set(["organizations", "common", "consumers"]);

// network/other — caller should fail-open
export type TenantValidation =
  { ok: true } | { ok: false; reason: "not_found" } | { ok: "unknown" };

export async function validateMicrosoftTenant(tenantId: string): Promise<TenantValidation> {
  const t = tenantId.trim();
  if (t.length === 0 || WELL_KNOWN_TENANTS.has(t.toLowerCase())) return { ok: true };
  const host = process.env.MICROSOFT_OAUTH_BASE_URL || "https://login.microsoftonline.com";
  try {
    const res = await fetch(
      `${host}/${encodeURIComponent(t)}/v2.0/.well-known/openid-configuration`
    );
    if (res.ok) return { ok: true };
    if (res.status === 400) return { ok: false, reason: "not_found" };
    return { ok: "unknown" }; // 5xx etc. — don't block on a transient upstream problem
  } catch {
    return { ok: "unknown" }; // network error — fail-open
  }
}
