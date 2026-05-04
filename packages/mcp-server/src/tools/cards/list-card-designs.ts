import { z } from "zod";

import type { CardDesign, ListCardDesignsResponse } from "../../types/brighty.js";
import { defineBrightyTool } from "../tool.js";

const inputSchema = z.object({});

export const listCardDesigns = defineBrightyTool({
  name: "brighty_list_card_designs",
  description:
    "List the card designs available to the authenticated business. Each design's id can be passed as cardDesignId when ordering a card via brighty_order_card. The API takes no filter params.",
  inputSchema,
  execute: async (client) => {
    const response = await client.get<ListCardDesignsResponse>("/cards/designs");
    const designs: CardDesign[] = response.cardDesigns ?? [];
    return designs;
  },
});
