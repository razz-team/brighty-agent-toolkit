import { z } from "zod";

import { defineBrightyTool } from "../tool.js";

const inputSchema = z.object({
  memberIds: z
    .array(z.string().min(1))
    .min(1)
    .describe("Brighty member ids to remove from the business."),
});

export const removeMembers = defineBrightyTool({
  name: "brighty_remove_members",
  description:
    "Remove one or more members from the authenticated Brighty business. The acting key must have an admin-grade role. This is irreversible; removed members can be re-invited later.",
  inputSchema,
  execute: async (client, args) => {
    // Brighty API field name is `members` (UUID array), not `memberIds`.
    // We keep the tool input as `memberIds` for clarity to the agent, then
    // rename in the body.
    await client.post<void>("/members/remove", {
      body: { members: args.memberIds },
    });
    return {
      removed: args.memberIds,
      count: args.memberIds.length,
    };
  },
});
