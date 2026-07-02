// Cross-package drift guard (AGENTS.md § C10 — legacy email operation
// vocabulary): the "search"/"list" → "read" alias rule is implemented TWICE,
// once in the web package (tool-registry.ts's getEmailToolsForOperations,
// which drives what allowed_tools the config generator emits) and once in
// the pinchy-email plugin (permissions.ts's checkPermission, which gates
// tool calls at runtime). The two copies are linked only by comments — the
// plugin cannot import web code (it ships and runs standalone inside the
// OpenClaw container), so there is no way to share a single implementation.
//
// If a future change widens or narrows the alias in only ONE of the two
// places (e.g. someone adds a THIRD legacy operation to tool-registry.ts but
// forgets permissions.ts, or vice versa), the web-emitted allowed_tools and
// the plugin's runtime gate silently diverge: an agent could have a tool
// listed in `tools.allow` that the plugin then denies at the permission
// check (or the reverse — a plugin permission grant with no corresponding
// tool ever exposed). This test pins their equivalence so CI fails the
// moment the two copies drift, the same role manifest-tools-drift.test.ts
// plays for contracts.tools vs registerTool() in a single plugin.
import { describe, it, expect } from "vitest";
import { checkPermission, type Permissions } from "../../../../plugins/pinchy-email/permissions";
import { getEmailToolsForOperations, EMAIL_READ_TOOLS } from "@/lib/tool-registry";

// Legacy + current email operation vocabulary. "search" and "list" are the
// two pre-#328 per-tool operations that must alias into "read" at BOTH
// layers; "read"/"draft"/"send" are the canonical vocabulary; the empty set
// and an unknown string are included as boundary cases.
const OPERATION_SETS: string[][] = [
  ["read"],
  ["search"],
  ["list"],
  ["draft"],
  ["send"],
  ["search", "draft"],
  ["list", "send"],
  ["read", "search"],
  ["read", "list"],
  [],
  ["bogus"],
];

function pluginGrantsRead(operations: string[]): boolean {
  const permissions: Permissions = { email: operations };
  return checkPermission(permissions, "email", "read");
}

function webGrantsRead(operations: string[]): boolean {
  const tools = getEmailToolsForOperations(operations);
  // "Grants read" at the web layer means the full read toolset is present.
  // getEmailToolsForOperations either pushes the entire EMAIL_READ_TOOLS
  // block or none of it, so checking for any one read tool is equivalent to
  // checking for all of them — but assert the whole block for precision.
  const hasAllReadTools = EMAIL_READ_TOOLS.every((t) => tools.includes(t));
  const hasAnyReadTool = EMAIL_READ_TOOLS.some((t) => tools.includes(t));
  expect(hasAllReadTools).toBe(hasAnyReadTool); // never a partial read grant
  return hasAllReadTools;
}

describe("email-legacy-alias-drift", () => {
  describe.each(OPERATION_SETS.map((operations) => [operations]))("operations=%j", (operations) => {
    it("checkPermission(read) and getEmailToolsForOperations agree on whether 'read' is granted", () => {
      expect(pluginGrantsRead(operations)).toBe(webGrantsRead(operations));
    });

    it("never lets 'search' or 'list' alone unlock 'draft' at either layer", () => {
      if (!operations.includes("search") && !operations.includes("list")) return;
      if (operations.includes("draft") || operations.includes("send")) return;

      const permissions: Permissions = { email: operations };
      expect(checkPermission(permissions, "email", "draft")).toBe(false);

      const tools = getEmailToolsForOperations(operations);
      expect(tools).not.toContain("email_draft");
    });

    it("never lets 'search' or 'list' alone unlock 'send' at either layer", () => {
      if (!operations.includes("search") && !operations.includes("list")) return;
      if (operations.includes("draft") || operations.includes("send")) return;

      const permissions: Permissions = { email: operations };
      expect(checkPermission(permissions, "email", "send")).toBe(false);

      const tools = getEmailToolsForOperations(operations);
      expect(tools).not.toContain("email_send");
    });
  });
});
