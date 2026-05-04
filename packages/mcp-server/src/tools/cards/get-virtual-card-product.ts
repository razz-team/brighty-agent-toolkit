import { z } from "zod";

import type { CardProductResponse } from "../../types/brighty.js";
import { defineBrightyTool } from "../tool.js";

const inputSchema = z.object({});

export const getVirtualCardProduct = defineBrightyTool({
  name: "brighty_get_virtual_card_product",
  description:
    "Fetch the virtual card product configuration: per-condition fees (issueFee, deliveryFee), free/total card limits, supported form factors and card types. Call this before brighty_order_card so the user can see what's offered. The API takes no input parameters.",
  inputSchema,
  execute: async (client) => client.get<CardProductResponse>("/cards/products/virtual"),
});
