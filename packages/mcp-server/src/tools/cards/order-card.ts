import { randomUUID } from "node:crypto";
import { z } from "zod";

import type { BrightyClient } from "../../api/client.js";
import type {
  Card,
  CardLimitsName,
  CardOrderIntent,
  CardOrderResponse,
  Money,
} from "../../types/brighty.js";
import { defineBrightyTool } from "../tool.js";

const moneySchema = z.object({
  amount: z
    .string()
    .regex(/^-?\d+(\.\d+)?$/, "amount must be a decimal string like '500.00'")
    .describe("Decimal amount as a string, e.g. '500.00'."),
  currency: z.string().min(3).max(8).describe("ISO-4217 currency, must match the card's currency."),
});

const spendingLimitSchema = z.object({
  policy: z
    .enum(["UNLIMITED", "MONTHLY"])
    .describe(
      "Spending policy. UNLIMITED = no cap; MONTHLY = `limit` enforced per calendar month.",
    ),
  limit: moneySchema
    .optional()
    .describe("Required when policy=MONTHLY; ignored when policy=UNLIMITED."),
});

// .strict() rejects unknown keys at parse time. Without it, a caller could
// send `idempotencyKey` and Zod would silently strip it — the body still
// changes per call (fresh intent hash), so the API would issue a new card on
// every "retry". Strict mode makes the no-caller-key contract enforceable.
export const orderCardInputSchema = z
  .object({
    cardDesignId: z
      .string()
      .min(1)
      .describe(
        "Card design id from brighty_list_card_designs. The design pins the card formFactor (VIRTUAL / PLASTIC / METAL).",
      ),
    customerId: z
      .string()
      .min(1)
      .describe(
        "Customer id (UUID) the card will be issued to. Get from brighty_list_members for team cards or use the business owner's id for own card.",
      ),
    sourceAccountId: z
      .string()
      .min(1)
      .describe("Brighty account id the new card will spend from. Determines the card's currency."),
    holderName: z
      .string()
      .min(1)
      .max(60)
      .optional()
      .describe(
        "Name as it should appear on the card. Defaults to the customer's profile name when omitted.",
      ),
    cardName: z
      .string()
      .min(1)
      .max(60)
      .optional()
      .describe("Internal label for the card; not embossed."),
    spendingLimit: spendingLimitSchema
      .optional()
      .describe("Optional initial spending policy. Use brighty_set_card_limits to change later."),
  })
  .strict();

export type OrderCardArgs = z.infer<typeof orderCardInputSchema>;

export interface OrderCardResult {
  intent: CardOrderIntent;
  card: Card;
  idempotencyKey: string;
}

export async function runOrderCardIntent(
  client: BrightyClient,
  args: OrderCardArgs,
): Promise<CardOrderIntent> {
  const body: Record<string, unknown> = {
    cardDesignId: args.cardDesignId,
    customerId: args.customerId,
  };
  if (args.holderName !== undefined) body.holderName = args.holderName;
  return client.post<CardOrderIntent>("/cards/order/intent", { body });
}

function spendingLimitBody(
  spendingLimit: OrderCardArgs["spendingLimit"],
): { name: CardLimitsName; limit?: Money } | undefined {
  if (!spendingLimit) return undefined;
  if (spendingLimit.policy === "MONTHLY") {
    if (spendingLimit.limit === undefined) {
      throw new Error("spendingLimit.limit is required when spendingLimit.policy=MONTHLY.");
    }
    return { name: "MONTHLY", limit: spendingLimit.limit };
  }
  return { name: "UNLIMITED" };
}

export async function runOrderCard(
  client: BrightyClient,
  args: OrderCardArgs,
): Promise<OrderCardResult> {
  // The idempotency key is generated per invocation, not accepted from the
  // caller: a fresh intent (with a fresh hash) is fetched each call, so the
  // /cards/order body changes between retries — reusing a key with a
  // different body would either fail the API's body-binding check or, worse,
  // issue a card at fees the user never approved.
  const intent = await runOrderCardIntent(client, args);
  const idempotencyKey = randomUUID();
  const body: Record<string, unknown> = {
    cardDesignId: args.cardDesignId,
    customerId: args.customerId,
    sourceAccountId: args.sourceAccountId,
    fees: intent.fees,
    hash: intent.hash,
  };
  if (args.holderName !== undefined) body.holderName = args.holderName;
  if (args.cardName !== undefined) body.cardName = args.cardName;
  const limitBody = spendingLimitBody(args.spendingLimit);
  if (limitBody !== undefined) body.spendingLimit = limitBody;
  const response = await client.post<CardOrderResponse>("/cards/order", {
    body,
    idempotencyKey,
  });
  return { intent, card: response.card, idempotencyKey };
}

export const orderCard = defineBrightyTool({
  name: "brighty_order_card",
  description:
    "Order a new Brighty card. Two-step: first POST /cards/order/intent (returns fees, amount, and a short-lived hash), then POST /cards/order with hash + fees + sourceAccountId and a fresh UUIDv4 Idempotency-Key. Always show the user intent.fees + intent.amount before executing the order. Returns { intent, card, idempotencyKey }.",
  inputSchema: orderCardInputSchema,
  execute: runOrderCard,
});
