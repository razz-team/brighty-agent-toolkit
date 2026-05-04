import { z } from "zod";

import type { Card, ListCardsResponse } from "../../types/brighty.js";
import { defineBrightyTool } from "../tool.js";

const inputSchema = z.object({});

export const listCards = defineBrightyTool({
  name: "brighty_list_cards",
  description:
    "List Brighty cards (virtual / plastic / metal) for the authenticated business. Returns each card's id, name, type (DEBIT|CREDIT|PREPAID), network (VISA|MASTERCARD), formFactor, status (ISSUED|CREATED|ACTIVE|ACTIVATING|FROZEN|TERMINATED), cardHolderName, design, and optional bin/lastFour/limits. The API takes no filter params; filter results client-side if needed.",
  inputSchema,
  execute: async (client) => {
    const response = await client.get<ListCardsResponse>("/cards");
    const cards: Card[] = response.cards ?? [];
    return cards;
  },
});
