import { z } from "zod";

import type { Card } from "../../types/brighty.js";
import { defineBrightyTool } from "../tool.js";

const inputSchema = z.object({
  cardId: z.string().min(1).describe("Brighty card id."),
});

export const getCard = defineBrightyTool({
  name: "brighty_get_card",
  description:
    "Fetch a single Brighty card by id, including its kind, status, last4, attached accountId, currency, design, cardholder name, and current limits.",
  inputSchema,
  execute: async (client, args) => client.get<Card>(`/cards/${encodeURIComponent(args.cardId)}`),
});
