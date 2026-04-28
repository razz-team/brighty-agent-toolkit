import { z } from "zod";

import type { Account } from "../../types/brighty.js";
import { defineBrightyTool } from "../tool.js";

const inputSchema = z.object({
  status: z
    .enum(["ACTIVE", "TERMINATED", "PENDING", "BLOCKED"])
    .optional()
    .describe("Filter by account status."),
  type: z.enum(["CURRENT", "SAVING"]).optional().describe("Filter by account type."),
  currency: z
    .string()
    .min(3)
    .max(8)
    .optional()
    .describe("Filter by ISO-4217 currency or ticker, e.g. EUR, BTC."),
});

export const listAccounts = defineBrightyTool({
  name: "brighty_list_accounts",
  description:
    "List Brighty accounts for the authenticated business. Returns balances, currencies, statuses, and account types. Use this to enumerate accounts before transfers, balance checks, or payouts.",
  inputSchema,
  execute: async (client, args) =>
    client.get<Account[]>("/accounts", {
      query: {
        status: args.status,
        type: args.type,
        currency: args.currency,
      },
    }),
});
