import { z } from "zod";

import type { Card } from "../../types/brighty.js";
import { defineBrightyTool } from "../tool.js";

const inputSchema = z.object({
  cardId: z.string().min(1).describe("Brighty card id to unfreeze."),
});

export const unfreezeCard = defineBrightyTool({
  name: "brighty_unfreeze_card",
  description:
    "Unfreeze a previously frozen Brighty card so authorisations can resume. Has no effect on cards that are not in FROZEN status; check brighty_get_card first when in doubt.",
  inputSchema,
  execute: async (client, args) =>
    client.post<Card>(`/cards/${encodeURIComponent(args.cardId)}/unfreeze`),
});
