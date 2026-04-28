import { z } from "zod";

import type { AccountAddress } from "../../types/brighty.js";
import { defineBrightyTool } from "../tool.js";

const inputSchema = z.object({
  accountId: z.string().min(1).describe("Brighty account id."),
});

export const getAccountAddresses = defineBrightyTool({
  name: "brighty_get_account_addresses",
  description:
    "Fetch the deposit addresses for an account: IBAN/BIC for fiat, on-chain address (with memo when applicable) for crypto. Use this to share inbound payment details with a counterparty.",
  inputSchema,
  execute: async (client, args) =>
    client.get<AccountAddress[]>(`/accounts/${encodeURIComponent(args.accountId)}/addresses`),
});
