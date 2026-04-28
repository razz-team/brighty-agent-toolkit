import { z } from "zod";

import type { VirtualCardProduct } from "../../types/brighty.js";
import { defineBrightyTool } from "../tool.js";

const inputSchema = z.object({
  currency: z
    .string()
    .min(3)
    .max(8)
    .describe("ISO-4217 currency for the virtual card product, e.g. EUR or USD."),
});

export const getVirtualCardProduct = defineBrightyTool({
  name: "brighty_get_virtual_card_product",
  description:
    "Fetch the virtual card product available for a given currency, including the issuance fee, monthly fee, and the designs offered. Call this before brighty_order_card so the user can see fees and pick a design.",
  inputSchema,
  execute: async (client, args) =>
    client.get<VirtualCardProduct>("/cards/products/virtual", {
      query: { currency: args.currency },
    }),
});
