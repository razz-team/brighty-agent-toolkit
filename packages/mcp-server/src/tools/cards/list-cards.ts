import { z } from "zod";

import type { Card } from "../../types/brighty.js";
import { defineBrightyTool } from "../tool.js";

const inputSchema = z.object({
  status: z
    .enum(["ACTIVE", "FROZEN", "TERMINATED", "PENDING", "ORDERED"])
    .optional()
    .describe("Filter by card lifecycle status."),
  kind: z.enum(["VIRTUAL", "PHYSICAL"]).optional().describe("Filter by card kind."),
  accountId: z
    .string()
    .min(1)
    .optional()
    .describe("Restrict the result to cards attached to this Brighty account id."),
});

export const listCards = defineBrightyTool({
  name: "brighty_list_cards",
  description:
    "List Brighty cards (virtual and physical) for the authenticated business. Returns each card's kind, status, last4, attached accountId, currency, and limits. Use this to find a card id before freeze/unfreeze, limit changes, or detail lookups.",
  inputSchema,
  execute: async (client, args) =>
    client.get<Card[]>("/cards", {
      query: {
        status: args.status,
        kind: args.kind,
        accountId: args.accountId,
      },
    }),
});
