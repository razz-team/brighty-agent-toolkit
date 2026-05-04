import { z } from "zod";

import type { ListMembersResponse, Member } from "../../types/brighty.js";
import { defineBrightyTool } from "../tool.js";

const inputSchema = z.object({
  withTerminated: z
    .boolean()
    .optional()
    .describe("Include terminated members in the result. Defaults to false."),
});

export const listMembers = defineBrightyTool({
  name: "brighty_list_members",
  description:
    "List members of the authenticated Brighty business. Returns each member as { contact, customer, legalData, membership: { memberId, role, state } } where role is one of MEMBER | VIEWER | PAYER | ADMIN | OWNER. The only filter the API accepts is `withTerminated`; filter by role/email client-side if needed.",
  inputSchema,
  execute: async (client, args) => {
    const response = await client.get<ListMembersResponse>("/members", {
      query: {
        withTerminated: args.withTerminated,
      },
    });
    const members: Member[] = response.members ?? [];
    return members;
  },
});
