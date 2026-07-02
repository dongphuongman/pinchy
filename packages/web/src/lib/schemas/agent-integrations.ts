import { z } from "zod";
import { EMAIL_OPERATIONS } from "@/lib/tool-registry";

/**
 * Request schema for PUT /api/agents/[agentId]/integrations.
 *
 * `operation` is validated per-row: for model "email" it is restricted to
 * EMAIL_OPERATIONS (read/draft/send). Without this, pre-#328 legacy
 * per-tool operation strings ("search", "list") could be minted as NEW
 * agent_connection_permissions rows via this API — the runtime treats
 * "search"/"list" as an alias for "read" (see tool-registry.ts and the
 * pinchy-email plugin's permissions.ts), so a `{ model: "email", operation:
 * "search" }` row would silently grant a standing "read" toolset that (pre-
 * C2) the permissions UI didn't even render as checked, and the audit row
 * would log the raw legacy string instead of the effective operation.
 *
 * Other models (e.g. Odoo's per-model operations like "create") are
 * validated only as a non-empty string — this route is generic across
 * integration types, and the operation vocabulary is model-specific.
 */
export const setAgentIntegrationsSchema = z.object({
  connectionId: z.string().min(1),
  permissions: z
    .array(z.object({ model: z.string().min(1), operation: z.string().min(1) }))
    .superRefine((permissions, ctx) => {
      permissions.forEach((perm, index) => {
        if (
          perm.model === "email" &&
          !EMAIL_OPERATIONS.includes(perm.operation as (typeof EMAIL_OPERATIONS)[number])
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Invalid email operation "${perm.operation}". Allowed values: ${EMAIL_OPERATIONS.join(", ")}.`,
            path: [index, "operation"],
          });
        }
      });
    }),
});

export type SetAgentIntegrationsInput = z.infer<typeof setAgentIntegrationsSchema>;
