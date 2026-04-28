import { z } from "zod";

import type { Account } from "../../types/brighty.js";
import { defineBrightyTool } from "../tool.js";

const inputSchema = z.object({
  accountId: z.string().min(1).describe("Brighty account id."),
});

export const getAccount = defineBrightyTool({
  name: "brighty_get_account",
  description:
    "Fetch a single Brighty account by id, including balance, currency, status, and type.",
  inputSchema,
  execute: async (client, args) =>
    client.get<Account>(`/accounts/${encodeURIComponent(args.accountId)}`),
});
