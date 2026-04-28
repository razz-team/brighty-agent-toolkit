import { z } from "zod";

import type { PaginatedResponse, Payout } from "../../types/brighty.js";
import { defineBrightyTool } from "../tool.js";

const inputSchema = z.object({
  status: z
    .enum(["DRAFT", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"])
    .optional()
    .describe("Filter by payout lifecycle status."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe("Maximum number of payouts to return (1-200)."),
  cursor: z
    .string()
    .min(1)
    .optional()
    .describe("Opaque cursor returned by a previous call for pagination."),
});

export const listPayouts = defineBrightyTool({
  name: "brighty_list_payouts",
  description:
    "List Brighty payouts for the authenticated business. A payout is a container that groups one or more transfers (internal or external) and moves through DRAFT → RUNNING → COMPLETED/FAILED/CANCELLED. Returns { items, cursor, hasMore }; pass cursor.next back as `cursor` to fetch the next page. Use this to find an existing payout by status before adding more transfers or starting it.",
  inputSchema,
  execute: async (client, args) =>
    client.get<PaginatedResponse<Payout>>("/payouts", {
      query: {
        status: args.status,
        limit: args.limit,
        cursor: args.cursor,
      },
    }),
});
