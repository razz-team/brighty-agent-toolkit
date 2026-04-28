import { z } from "zod";

import type { CardDesign } from "../../types/brighty.js";
import { defineBrightyTool } from "../tool.js";

const inputSchema = z.object({
  kind: z.enum(["VIRTUAL", "PHYSICAL"]).optional().describe("Filter designs by card kind."),
});

export const listCardDesigns = defineBrightyTool({
  name: "brighty_list_card_designs",
  description:
    "List the card designs available to the authenticated business. Each design's id can be passed as designId when ordering a card via brighty_order_card.",
  inputSchema,
  execute: async (client, args) =>
    client.get<CardDesign[]>("/cards/designs", {
      query: { kind: args.kind },
    }),
});
