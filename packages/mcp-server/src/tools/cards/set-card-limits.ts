import { z } from "zod";

import type { Card } from "../../types/brighty.js";
import { defineBrightyTool } from "../tool.js";

const moneySchema = z.object({
  amount: z
    .string()
    .regex(/^-?\d+(\.\d+)?$/, "amount must be a decimal string like '100.00'")
    .describe("Decimal amount as a string, e.g. '500.00'."),
  currency: z
    .string()
    .min(3)
    .max(8)
    .describe("ISO-4217 currency, e.g. EUR or USD. Should match the card's currency."),
});

const inputSchema = z.object({
  cardId: z.string().min(1).describe("Brighty card id whose limits will be updated."),
  daily: moneySchema
    .optional()
    .describe(
      "Daily spend limit. Set both daily and monthly together to fully replace the existing limit set; provide one to update only that bucket.",
    ),
  monthly: moneySchema.optional().describe("Monthly spend limit."),
});

export const setCardLimits = defineBrightyTool({
  name: "brighty_set_card_limits",
  description:
    "Replace a Brighty card's spend limits. Sends a PUT to /cards/:id/limits with daily and/or monthly Money objects. Currencies must match the card's currency. Provide at least one of daily or monthly.",
  inputSchema,
  execute: async (client, args) => {
    if (args.daily === undefined && args.monthly === undefined) {
      throw new Error(
        "brighty_set_card_limits requires at least one of daily or monthly to be supplied.",
      );
    }
    const body: Record<string, unknown> = {};
    if (args.daily !== undefined) body.daily = args.daily;
    if (args.monthly !== undefined) body.monthly = args.monthly;
    return client.put<Card>(`/cards/${encodeURIComponent(args.cardId)}/limits`, { body });
  },
});
