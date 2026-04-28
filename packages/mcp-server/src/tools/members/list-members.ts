import { z } from "zod";

import type { Member } from "../../types/brighty.js";
import { defineBrightyTool } from "../tool.js";

const inputSchema = z.object({
  status: z.enum(["ACTIVE", "INVITED", "REMOVED"]).optional().describe("Filter by member status."),
  role: z
    .enum(["OWNER", "ADMIN", "ACCOUNTANT", "EMPLOYEE"])
    .optional()
    .describe("Filter by member role."),
});

export const listMembers = defineBrightyTool({
  name: "brighty_list_members",
  description:
    "List members of the authenticated Brighty business. Returns each member's email, role, and status. Use this to find a member id before adding or removing teammates.",
  inputSchema,
  execute: async (client, args) =>
    client.get<Member[]>("/members", {
      query: {
        status: args.status,
        role: args.role,
      },
    }),
});
