import { randomUUID } from "node:crypto";
import { z } from "zod";

import type { BrightyClient } from "../../api/client.js";
import type { Card, CardOrderIntent } from "../../types/brighty.js";
import { defineBrightyTool } from "../tool.js";

const moneySchema = z.object({
  amount: z
    .string()
    .regex(/^-?\d+(\.\d+)?$/, "amount must be a decimal string like '100.00'")
    .describe("Decimal amount as a string, e.g. '500.00'."),
  currency: z.string().min(3).max(8).describe("ISO-4217 currency, must match the card's currency."),
});

const limitsSchema = z.object({
  daily: moneySchema.optional().describe("Daily spend limit."),
  monthly: moneySchema.optional().describe("Monthly spend limit."),
});

// .strict() rejects unknown keys at parse time. Without it, a caller could
// send `idempotencyKey` and Zod would silently strip it — the body still
// changes per call (fresh intent hash), so the API would issue a new card on
// every "retry". Strict mode makes the no-caller-key contract enforceable.
export const orderCardInputSchema = z
  .object({
    kind: z
      .enum(["VIRTUAL", "PHYSICAL"])
      .describe(
        "Card kind. VIRTUAL is issued instantly; PHYSICAL is shipped and may have additional product checks.",
      ),
    accountId: z
      .string()
      .min(1)
      .describe(
        "Brighty account id the new card will be attached to. Determines the card's currency.",
      ),
    designId: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Card design id from brighty_list_card_designs. The default design is used if omitted.",
      ),
    cardholderName: z
      .string()
      .min(1)
      .max(60)
      .optional()
      .describe(
        "Name as it should appear on the card. Defaults to the cardholder's profile name when omitted.",
      ),
    limits: limitsSchema
      .optional()
      .describe("Optional initial spend limits. Use brighty_set_card_limits to change later."),
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
    kind: args.kind,
    accountId: args.accountId,
  };
  if (args.designId !== undefined) body.designId = args.designId;
  if (args.cardholderName !== undefined) body.cardholderName = args.cardholderName;
  if (args.limits !== undefined) body.limits = args.limits;
  return client.post<CardOrderIntent>("/cards/order/intent", { body });
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
  const card = await client.post<Card>("/cards/order", {
    body: { hash: intent.hash },
    idempotencyKey,
  });
  return { intent, card, idempotencyKey };
}

export const orderCard = defineBrightyTool({
  name: "brighty_order_card",
  description:
    "Order a new Brighty card. Two-step: first POST /cards/order/intent to get fees and a short-lived hash, then POST /cards/order with that hash and a fresh UUIDv4 idempotency key. Always show the user the fees from the intent before executing the order. Returns { intent, card, idempotencyKey }.",
  inputSchema: orderCardInputSchema,
  execute: runOrderCard,
});
