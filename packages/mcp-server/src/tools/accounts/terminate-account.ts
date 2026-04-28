import { z } from "zod";

import { defineBrightyTool } from "../tool.js";

const inputSchema = z.object({
  accountId: z
    .string()
    .min(1)
    .describe("Brighty account id to terminate. Must be empty (zero balance)."),
});

export const terminateAccount = defineBrightyTool({
  name: "brighty_terminate_account",
  description:
    "Close a Brighty account. The account must be empty (zero balance) and not the primary account. This is irreversible.",
  inputSchema,
  execute: async (client, args) => {
    await client.delete<void>(`/accounts/${encodeURIComponent(args.accountId)}`);
    return { accountId: args.accountId, status: "TERMINATED" as const };
  },
});
