import { z } from "zod";

import type { GetPayoutsResponse } from "../../types/brighty.js";
import { defineBrightyTool } from "../tool.js";

const inputSchema = z.object({});

export const listPayouts = defineBrightyTool({
  name: "brighty_list_payouts",
  description:
    "List Brighty payouts for the authenticated business. Returns { payouts: Payout[], nextPage?: string } where each Payout has id, createdAt, state (CREATED|STARTED|COMPLETED), paidTransfers, totalTransfers, and optional name/description/amounts/timestamps. The Brighty API exposes no input cursor parameter; nextPage is informational only.",
  inputSchema,
  execute: async (client) => client.get<GetPayoutsResponse>("/payouts"),
});
