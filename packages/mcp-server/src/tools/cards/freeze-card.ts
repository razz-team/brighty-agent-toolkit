import { z } from "zod";

import type { Card } from "../../types/brighty.js";
import { defineBrightyTool } from "../tool.js";

const inputSchema = z.object({
  cardId: z.string().min(1).describe("Brighty card id to freeze."),
});

export const freezeCard = defineBrightyTool({
  name: "brighty_freeze_card",
  description:
    "Freeze a Brighty card. Authorisations are blocked while the card is frozen; the card can be re-enabled with brighty_unfreeze_card. Use immediately when the user reports a lost or suspected-compromised card.",
  inputSchema,
  execute: async (client, args) =>
    client.post<Card>(`/cards/${encodeURIComponent(args.cardId)}/freeze`),
});
