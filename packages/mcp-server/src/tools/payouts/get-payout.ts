import { z } from "zod";

import type { GetPayoutResponse } from "../../types/brighty.js";
import { defineBrightyTool } from "../tool.js";

const inputSchema = z.object({
  payoutId: z.string().min(1).describe("Brighty payout id."),
  createdAt: z
    .string()
    .min(1)
    .describe(
      "Payout's createdAt timestamp (ISO Instant). Required by the Brighty API alongside the id — the value is returned by brighty_create_payout and brighty_list_payouts. Pass it back exactly as received.",
    ),
});

export const getPayout = defineBrightyTool({
  name: "brighty_get_payout",
  description:
    "Fetch a single Brighty payout by id. Returns { payout, transfers[] } where transfers are discriminated by type (Crypto | Fiat | Internal). The Brighty API requires `createdAt` as a query param alongside the path id — pass the value returned from brighty_create_payout / brighty_list_payouts.",
  inputSchema,
  execute: async (client, args) =>
    client.get<GetPayoutResponse>(`/payouts/${encodeURIComponent(args.payoutId)}`, {
      query: { createdAt: args.createdAt },
    }),
});
