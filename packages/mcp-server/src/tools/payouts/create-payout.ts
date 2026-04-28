import { z } from "zod";

import type { Payout } from "../../types/brighty.js";
import { defineBrightyTool } from "../tool.js";

const inputSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(120)
    .optional()
    .describe("Optional human-friendly label for the payout, e.g. 'April salaries'."),
});

export const createPayout = defineBrightyTool({
  name: "brighty_create_payout",
  description:
    "Create a new Brighty payout in DRAFT state. The payout is an empty container; add transfers to it with brighty_create_internal_transfer / brighty_create_external_transfer, then commit with brighty_start_payout. Returns the created payout including its id.",
  inputSchema,
  execute: async (client, args) =>
    client.post<Payout>("/payouts", {
      body: args.name !== undefined ? { name: args.name } : {},
    }),
});
