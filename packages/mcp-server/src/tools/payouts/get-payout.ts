import { z } from "zod";

import type { Payout } from "../../types/brighty.js";
import { defineBrightyTool } from "../tool.js";

const inputSchema = z.object({
  payoutId: z.string().min(1).describe("Brighty payout id."),
});

export const getPayout = defineBrightyTool({
  name: "brighty_get_payout",
  description:
    "Fetch a single Brighty payout by id, including its current status, totals by currency, and the list of transfers attached to it.",
  inputSchema,
  execute: async (client, args) =>
    client.get<Payout>(`/payouts/${encodeURIComponent(args.payoutId)}`),
});
