import { z } from "zod";

import type { Card } from "../../types/brighty.js";
import { defineBrightyTool } from "../tool.js";

const moneySchema = z.object({
  amount: z
    .string()
    .regex(/^-?\d+(\.\d+)?$/, "amount must be a decimal string like '500.00'")
    .describe("Decimal amount as a string, e.g. '500.00'."),
  currency: z.string().min(3).max(8).describe("ISO-4217 currency, must match the card's currency."),
});

const inputSchema = z.object({
  cardId: z.string().min(1).describe("Brighty card id whose limits will be updated."),
  policy: z
    .enum(["UNLIMITED", "MONTHLY"])
    .describe(
      "Spending limit policy. UNLIMITED removes the cap. MONTHLY enforces the supplied `limit` per calendar month.",
    ),
  limit: moneySchema
    .optional()
    .describe(
      "Money cap for the policy. Required when policy=MONTHLY; ignored when policy=UNLIMITED.",
    ),
});

export const setCardLimits = defineBrightyTool({
  name: "brighty_set_card_limits",
  description:
    "Replace a Brighty card's spending policy. Sends PUT /cards/:id/limits with { name: 'UNLIMITED' | 'MONTHLY', limit?: Money }. Use UNLIMITED to remove the cap, MONTHLY plus a Money limit to set a per-month spend cap. Returns the updated Card.",
  inputSchema,
  execute: async (client, args) => {
    if (args.policy === "MONTHLY" && args.limit === undefined) {
      throw new Error("brighty_set_card_limits requires `limit` when policy=MONTHLY.");
    }
    const body: Record<string, unknown> = { name: args.policy };
    if (args.policy === "MONTHLY" && args.limit !== undefined) {
      body.limit = args.limit;
    }
    return client.put<Card>(`/cards/${encodeURIComponent(args.cardId)}/limits`, { body });
  },
});
