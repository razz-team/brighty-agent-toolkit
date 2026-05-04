import { z } from "zod";

import type { AccountAddress, ListAccountAddressesResponse } from "../../types/brighty.js";
import { defineBrightyTool } from "../tool.js";

const inputSchema = z.object({
  accountId: z.string().min(1).describe("Brighty account id."),
});

export const getAccountAddresses = defineBrightyTool({
  name: "brighty_get_account_addresses",
  description:
    "Fetch the routing addresses for an account: IBAN/BIC for fiat (typed by `type` as INTERNATIONAL/LOCAL_EU/LOCAL_UK/LOCAL_US), on-chain address (with memo when applicable) for crypto where `type` carries the network (e.g. ERC20, TON). Use this to share inbound payment details with a counterparty.",
  inputSchema,
  execute: async (client, args) => {
    const response = await client.get<ListAccountAddressesResponse>(
      `/accounts/${encodeURIComponent(args.accountId)}/addresses`,
    );
    const addresses: AccountAddress[] = response.addresses ?? [];
    return addresses;
  },
});
