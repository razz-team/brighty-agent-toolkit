import { z } from "zod";

import type { BrightyClient } from "../../api/client.js";
import type { OwnTransferIntent } from "../../types/brighty.js";
import { defineBrightyTool } from "../tool.js";

const moneySchema = z.object({
  amount: z
    .string()
    .regex(/^-?\d+(\.\d+)?$/, "amount must be a decimal string like '100.00'")
    .describe("Decimal amount as a string, e.g. '100.00'."),
  currency: z
    .string()
    .min(3)
    .max(8)
    .describe("ISO-4217 currency or supported crypto ticker, e.g. EUR or BTC."),
});

// .strict() rejects unknown keys at parse time. transferOwn extends this
// schema; accepting a caller-supplied `idempotencyKey` there would be unsafe:
// each call refetches the intent (fresh hash), so the body changes per
// attempt and a "retry" is actually a new transfer. Strict mode makes that
// contract enforceable instead of silently dropping the key.
export const transferIntentInputSchema = z
  .object({
    sourceAccountId: z.string().min(1).describe("Brighty account id the funds come from."),
    amount: moneySchema.describe("Amount and currency to convert."),
    side: z
      .enum(["SELL", "BUY"])
      .describe(
        "Which side of the FX the supplied amount applies to. SELL = sell exactly this much of `sourceCurrency`; BUY = buy exactly this much of `targetCurrency`.",
      ),
    sourceCurrency: z
      .string()
      .min(3)
      .max(8)
      .describe("ISO-4217 currency or ticker the source side is denominated in."),
    targetCurrency: z
      .string()
      .min(3)
      .max(8)
      .describe("ISO-4217 currency or ticker to convert into."),
  })
  .strict();

export type TransferIntentArgs = z.infer<typeof transferIntentInputSchema>;

export async function runTransferIntent(
  client: BrightyClient,
  args: TransferIntentArgs,
): Promise<OwnTransferIntent> {
  return client.post<OwnTransferIntent>("/transfers/own/intent", {
    body: {
      amount: args.amount,
      side: args.side,
      sourceCurrency: args.sourceCurrency,
      targetCurrency: args.targetCurrency,
    },
  });
}

export const transferIntent = defineBrightyTool({
  name: "brighty_transfer_intent",
  description:
    "Preview an FX transfer between two of the business's own Brighty accounts. Returns { amount, quote: { sourceAmount, targetAmount, fx? }, fees, deliveryInfo, hash }. The hash is short-lived; forward it to brighty_transfer_own to execute. Always call this first so the user can confirm the rate before commitment.",
  inputSchema: transferIntentInputSchema,
  execute: runTransferIntent,
});
