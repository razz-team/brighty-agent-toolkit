import { z } from "zod";

import type { Account } from "../../types/brighty.js";
import { defineBrightyTool } from "../tool.js";

const inputSchema = z.object({
  type: z
    .enum(["CURRENT", "SAVING"])
    .describe("Account type. CURRENT for day-to-day spend, SAVING for vault."),
  currency: z
    .string()
    .min(3)
    .max(8)
    .describe("ISO-4217 currency or supported crypto ticker, e.g. EUR or BTC."),
  name: z.string().min(1).max(120).optional().describe("Optional human-friendly label."),
});

export const createAccount = defineBrightyTool({
  name: "brighty_create_account",
  description:
    "Open a new Brighty account for the authenticated business. Specify the account type and currency; an optional name labels the account in the UI.",
  inputSchema,
  execute: async (client, args) =>
    client.post<Account>("/accounts", {
      body: {
        type: args.type,
        currency: args.currency,
        ...(args.name !== undefined ? { name: args.name } : {}),
      },
    }),
});
