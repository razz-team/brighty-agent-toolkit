import { z } from "zod";

import type { Account, ListAccountsResponse } from "../../types/brighty.js";
import { defineBrightyTool } from "../tool.js";

const inputSchema = z.object({
  type: z.enum(["CURRENT", "SAVING"]).optional().describe("Filter by account type."),
  holderId: z
    .string()
    .min(1)
    .optional()
    .describe("Filter by account holder id (UUID). Defaults to the business when omitted."),
});

export const listAccounts = defineBrightyTool({
  name: "brighty_list_accounts",
  description:
    "List Brighty accounts for the authenticated business. Returns each account's id, type, balance (Money), holderId, ownerId, openedAt, and optional name. Optional filters: type (CURRENT/SAVING) and holderId. Use this to enumerate accounts before transfers, balance checks, or payouts.",
  inputSchema,
  execute: async (client, args) => {
    const response = await client.get<ListAccountsResponse>("/accounts", {
      query: {
        type: args.type,
        holderId: args.holderId,
      },
    });
    // Tool returns the bare array for ergonomic forwarding to the agent;
    // wrappers like { accounts: [...] } add nesting without value.
    const accounts: Account[] = response.accounts ?? [];
    return accounts;
  },
});
